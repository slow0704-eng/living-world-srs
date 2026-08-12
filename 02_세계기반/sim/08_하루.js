/* 섬 생태 시뮬레이터 — [S-4] 하루 파이프라인 — 배열 순서가 곧 인과다
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

import { ECO } from './01_사양상수.js';
import { TUNE } from './02_튜닝상수.js';
import { clamp, lerp } from './03_유틸.js';
import { newInd, addEv, killInd, indAge } from './06_개체.js';
import { computeWaterDist } from './07_세계생성.js';
import { refreshSpeciesCounts, recordSample, closeYear, watchEvents } from './09_통계이력.js';
import { logChron } from './09_통계이력.js';

export const DAY_PHASES=[
  ['환경',phaseEnvironment], ['화재',phaseFire], ['대형 초식',phaseHerds],
  ['무리 병합',phaseMergeHerds], ['포식',phasePredation], ['기록',phaseBookkeeping],
];
export function stepDay(w){ for(const [,fn] of DAY_PHASES) fn(w); }

export function seasonOf(w){
  const wet=w.day<w.wetDays;
  const tempC=w.C.tempMeanC+w.C.tempAnnualRangeC/2*Math.cos((w.day-20)/365*Math.PI*2);
  const shape=wet?Math.sin(w.day/w.wetDays*Math.PI)**1.4:0;
  const rainMm=w.C.rainAnnualMm/(w.wetDays*0.61)*shape*(w.dry?0.6:1);
  return {wet,tempC,rainMm,dryProgress:wet?0:(w.day-w.wetDays)/Math.max(365-w.wetDays,1)};
}

export function phaseEnvironment(w){
  const {g,land,elev,soil,fert,fear,burn,fire,rainMul,C,plantB,plantCap,t2d,grass,woody,pm,tm}=w;
  const s=seasonOf(w), N=g.N, nP=pm.n, nT2=tm.n, K=TUNE.t2UpdateEvery;
  const nppDay=C.nppTonPerKm2Yr*w.cellKm2/365;
  const day=w.day, invWoodyCap=1/w.woodyCap;
  let sumSoil=0,burning=0,prod=0,sumG=0,sumW=0;
  /* 셀 한 번 훑기 안에서 물 · 식물 · T2를 모두 처리한다.
     종을 나눈 뒤 패스를 여러 번 돌면 비용이 종 수만큼 곱해진다. */
  for(let i=0;i<N;i++){
    if(!land[i]) continue;
    const et=TUNE.etBaseMm+TUNE.etPerDegC*Math.max(0,s.tempC-elev[i]/154-14);
    const sw=clamp(soil[i]+s.rainMm*rainMul[i]*(1-C.runoffCoef)-et,0,TUNE.soilCapMm);
    soil[i]=sw; sumSoil+=sw;
    if(burn[i]>=0) burn[i]++;
    if(fire[i]) burning++;
    fear[i]*=TUNE.fearDecay;

    /* 초지 부양력은 '그 셀의' 목본에 눌린다. 섬 전체 평균을 쓰면 섬이 균질해져
       방화선이 사라지고 화재가 전부 아니면 전무가 된다(퍼콜레이션). */
    const grassMul=1-TUNE.woodySuppression*clamp(woody[i]*invWoodyCap,0,1);
    const fWraw=clamp((sw-TUNE.wiltMm)/TUNE.fieldSpanMm,0,1);
    const fT=Math.exp(-((s.tempC-elev[i]*0.0065-C.tempOptC)**2)/TUNE.tempSigma);
    const fe=fert[i];
    let gi=0, wi=0;
    for(let k=0;k<nP;k++){
      const o=k*N+i;
      let capC=plantCap[o];
      if(!pm.woody[k]) capC*=grassMul;
      if(capC>0){
        // 내건성은 종을 '가르는' 값이지 모두를 살찌우는 값이 아니다.
        // 가산 보정을 쓰면 섬 전체 성장이 부풀어 연료와 목본이 함께 폭주한다.
        // 기후 최저 내건성을 기준으로 0.7~1.3 배율이 되도록 중립화한다(buildSpeciesMeta).
        const fW=clamp(fWraw*pm.drought[k],0,1);
        if(fW>0.02){
          const b=plantB[o];
          // 목본 성장도 토양수분에 제한된다. 이 fW를 빠뜨리면 목본이 2~3배 빨리
          // 자라 화재와의 경주에서 이겨버리고, 초지가 관목림으로 굳는다.
          const rate=pm.woody[k]? TUNE.woodyGrowthPerYr/365*b*(1-b/capC)*fW
                                : nppDay*pm.share[k]*fW*fT*fe*(1-b/capC);
          if(rate>0){ plantB[o]=b+rate; if(!pm.woody[k]) prod+=rate; }
        }
        if(plantB[o]>capC) plantB[o]=capC;
      }
      if(pm.woody[k]) wi+=plantB[o]; else gi+=plantB[o];
    }
    grass[i]=gi; woody[i]=wi; sumG+=gi; sumW+=wi;

    for(let k=0;k<nT2;k++){
      if((day+k)%K!==0||!tm.on[k]) continue;
      const o=k*N+i, v=t2d[o];
      if(v<=0) continue;
      let food=0; const dl=tm.diet[k];
      for(let m=0;m<dl.length;m++) food+=plantB[dl[m]*N+i];
      const cap=Math.max(food*tm.share[k]*8/tm.mass[k],0.2);
      const nv=v+v*tm.rate[k]*(1-v/cap);
      t2d[o]=nv<0.001?0:nv;
    }
  }
  Object.assign(w.env,{tempC:s.tempC,rainMm:s.rainMm,soilMm:sumSoil/w.landCount,
    grassT:sumG,woodyT:sumW,woodyFrac:sumW/(w.landCount*w.woodyCap),
    burning,wet:s.wet,dryProgress:s.dryProgress,
    prodEMA:w.env.prodEMA?w.env.prodEMA*0.996+prod*365*0.004:prod*365});
}

export function phaseFire(w){
  const {g,land,soil,water,fert,burn,fire,fireAge,plantB}=w, rng=w.rng, N=g.N;
  if(w.supp||!w.C.fireEnabled){ if(w.env.burning) fire.fill(0); return; }
  const s=seasonOf(w);
  const inSeason=!s.wet&&s.dryProgress>=TUNE.fireSeasonStart;
  const fuelMin=TUNE.fireFuelMinTonPerHa*w.cellHa;
  const fuelRef=TUNE.fireFuelRefTonPerHa*w.cellHa;
  const nf=new Uint8Array(N), nfAge=new Uint8Array(N);
  const pIg=TUNE.ignitionsPerKm2Yr*w.cellKm2/365/Math.max(1-TUNE.fireSeasonStart,0.01)
           *(365/Math.max(365-w.wetDays,1));
  for(let i=0;i<N;i++){
    if(!land[i]) continue;
    const dry=1-clamp(soil[i]/70,0,1);
    if(fire[i]){
      if(fireAge[i]>=TUNE.fireMaxAgeDays) continue;   // 다 탄 불은 더 번지지 않는다
      const x=g.xOf(i),y=g.yOf(i);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!g.inside(x+dx,y+dy)) continue;
        const j=g.idx(x+dx,y+dy);
        if(!land[j]||fire[j]||nf[j]||water[j]===2||w.grass[j]<=fuelMin) continue;
        const jd=1-clamp(soil[j]/70,0,1);
        if(jd<TUNE.fireDrynessMin) continue;
        const wind=dx<0?1+TUNE.fireWindBias:dx>0?1-TUNE.fireWindBias:1;
        const fuel=clamp((w.grass[j]-fuelMin)/(fuelRef-fuelMin),0,1);
        if(rng()<TUNE.fireSpreadP*jd*wind*fuel){ nf[j]=1; nfAge[j]=fireAge[i]+1; }
      }
    } else if(inSeason&&dry>0.55&&w.grass[i]>fuelMin&&rng()<pIg*dry){ nf[i]=1; nfAge[i]=0; w.acc.fireCount++; }
  }
  const pm=w.pm;
  for(let i=0;i<N;i++){
    if(fire[i]&&--fire[i]===0){
      let gi=0,wi=0;
      for(let k=0;k<pm.n;k++){
        const o=k*N+i;
        plantB[o]*= pm.woody[k]?TUNE.fireWoodySurvive:TUNE.fireGrassSurvive;
        if(pm.woody[k]) wi+=plantB[o]; else gi+=plantB[o];
      }
      w.grass[i]=gi; w.woody[i]=wi;
      fert[i]=Math.min(1,fert[i]+TUNE.fireAshFert);
      burn[i]=0; w.acc.burnedYr++;
    }
    if(nf[i]){ fire[i]=TUNE.fireBurnDays; fireAge[i]=nfAge[i]; }
  }
}

export function phaseHerds(w){
  const {g,land,gcap,soil,water,wdist,fear,press,C,species,plantB}=w, rng=w.rng, N=g.N;
  const s=seasonOf(w);
  press.fill(0); w.herdAt.clear();
  const stepGraze=TUNE.moveGrazeKmDay/w.cellKm, stepThirst=TUNE.moveThirstKmDay/w.cellKm;
  let satS=0,satN=0;
  for(let hi=w.herds.length-1;hi>=0;hi--){
    const h=w.herds[hi], sp=species[h.sp];
    h.x=clamp(h.x,0.5,g.W-1.5); h.y=clamp(h.y,0.5,g.H-1.5);
    let ci=g.idx(h.x|0,h.y|0);
    if(!land[ci]){ h.x=g.W/2; h.y=g.H/2; ci=g.idx(h.x|0,h.y|0); }

    const wasDry=h.hyd<TUNE.dehydrationOnset;
    h.hyd=clamp(h.hyd-1/(TUNE.hydrationDays*sp.droughtMul),0,1);
    if(wdist[ci]<=TUNE.drinkRadiusCells){ h.hyd=1;
      if(wasDry&&h.lead) addEv(w,h.lead,'move','수원에 도달해 물을 마심'); }

    // 섭식 : 자기 식이 목록의 식물만 먹는다. 목록이 넓을수록 가뭄에 강하다 [C-5.2]
    const demand=h.n*sp.massKg*ECO.dailyIntakeFrac/1000;
    const sl=sp._slots, ml=sp._mul;
    let avail=0;
    for(let k=0;k<sl.length;k++) avail+=plantB[sl[k]*N+ci]*ml[k]*C.browseAvailability;
    const taken=Math.min(avail,demand);
    if(avail>0) for(let k=0;k<sl.length;k++){
      const o=sl[k]*N+ci;
      plantB[o]-=taken*(plantB[o]*ml[k]/(avail/C.browseAvailability));
    }
    const sat=demand>0?taken/demand:1; satS+=sat; satN++;
    h.e=clamp(h.e+(sat-TUNE.satietyBreakEven)*TUNE.energyGainRate
              -TUNE.dehydrationPenalty*clamp((TUNE.dehydrationOnset-h.hyd)/TUNE.dehydrationOnset,0,1),0,1);

    const [dx,dy]=g.bestDir(h.x|0,h.y|0,j=>{
      if(!land[j]) return -Infinity;
      let f=0;
      for(let k=0;k<sl.length;k++) f+=plantB[sl[k]*N+j]*ml[k];
      const feed=clamp(f/sp._capRef,0,1);
      const thirst=(1-h.hyd)*(1-clamp(wdist[j]/TUNE.waterGradientCells,0,1));
      return TUNE.utilFeed*feed+TUNE.utilThirst*thirst-TUNE.utilFear*fear[j]
           -TUNE.utilCrowd*press[j]+rng()*TUNE.utilNoise;
    });
    moveBy(w,h,dx,dy,lerp(stepGraze,stepThirst,1-h.hyd)*sp.moveMul);
    if(h.lead){ h.lead.x=h.x; h.lead.y=h.y; h.lead.e=h.e; h.lead.hyd=h.hyd; }

    press[ci]+=h.n;
    const lst=w.herdAt.get(ci); if(lst) lst.push(h); else w.herdAt.set(ci,[h]);

    if(s.wet){ const b=h.n*TUNE.birthRate*sp.breedMul
                *clamp((h.e-TUNE.birthEnergyMin)/TUNE.birthEnergySpan,0,1);
      if(b>0){ h.n+=b; w.acc.bYr+=b;
        if(h.lead&&w.rng()<0.004){ h.lead.offspring++; addEv(w,h.lead,'breed','새끼를 낳음'); } } }
    { const d=h.n*TUNE.deathRate*clamp((TUNE.deathEnergyMax-h.e)/TUNE.deathEnergyMax,0,1);
      h.n-=d; w.acc.dYr+=d; }
    if(h.n<TUNE.herdMinSize){
      if(h.lead) killInd(w,h.lead,h.hyd<0.05?'갈증':'아사');
      w.herds.splice(hi,1); continue;
    }
    if(h.n>TUNE.herdSplitAt&&w.herds.length<2000){
      h.n/=2;
      const nh={x:h.x+rng()-.5,y:h.y+rng()-.5,n:h.n,e:h.e,hyd:h.hyd,sp:h.sp,lead:null};
      nh.lead=newInd(w,h.sp,nh.x,nh.y); nh.lead.herd=nh;
      addEv(w,nh.lead,'move','무리가 갈라져 나옴');
      w.herds.push(nh);
    }
  }
  w.env.satiety=satN?satS/satN:1;
}
/* 같은 셀의 작은 무리는 합친다. 단 같은 종끼리만이다.
   종별로 묶지 않고 정렬만 하면, 같은 종 짝을 못 만난 무리가 계속 소멸해
   무리 수가 단조 감소하면서 개체가 새어 나간다 (원칙 P8). */
export function phaseMergeHerds(w){
  let merged=false;
  const bySp=new Map();
  for(const lst of w.herdAt.values()){
    if(lst.length<2) continue;
    bySp.clear();
    for(const h of lst){
      let g=bySp.get(h.sp); if(!g){ g=[]; bySp.set(h.sp,g); }
      g.push(h);
    }
    for(const g of bySp.values()){
      if(g.length<2) continue;
      g.sort((a,b)=>a.n-b.n);
      while(g.length>1&&g[0].n<TUNE.herdMergeBelow){
        const a=g.shift(), b=g[0];
        b.e=(b.e*b.n+a.e*a.n)/(b.n+a.n); b.hyd=Math.max(b.hyd,a.hyd);
        b.n+=a.n; a.n=0; merged=true;
        if(a.lead){ addEv(w,a.lead,'move','다른 무리에 흡수됨'); killInd(w,a.lead,'무리 흡수'); }
      }
    }
  }
  if(merged) w.herds=w.herds.filter(h=>h.n>0);
}
export function phasePredation(w){
  buildPredDensity(w);
  hunt(w,w.p4,false); hunt(w,w.p5,true);
  immigrate(w);
}
export function buildPredDensity(w){
  const {g,dens4,dens5}=w;
  dens4.fill(0); dens5.fill(0);
  for(const p of w.p4) dens4[g.idx(clamp(p.x|0,0,g.W-1),clamp(p.y|0,0,g.H-1))]++;
  for(const p of w.p5) dens5[g.idx(clamp(p.x|0,0,g.W-1),clamp(p.y|0,0,g.H-1))]++;
}
export function guildCrowd(w,ci,dens){
  const {g}=w, x=g.xOf(ci), y=g.yOf(ci); let n=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
    if(g.inside(x+dx,y+dy)) n+=dens[g.idx(x+dx,y+dy)];
  return Math.max(0,n-1);
}
export function hunt(w,arr,isApex){
  const {g,land,fear,wdist,press,t2d,species}=w, rng=w.rng, N=g.N;
  const kind=isApex?'apex':'small';
  const dens=isApex?w.dens5:w.dens4;
  const bySpecies=new Map();
  for(const p of arr) bySpecies.set(p.sp,(bySpecies.get(p.sp)||0)+1);
  for(let k=arr.length-1;k>=0;k--){
    const p=arr[k], sp=species[p.sp];
    const need=sp.massKg*ECO.dailyIntakeFrac;
    p.x=clamp(p.x,0.5,g.W-1.5); p.y=clamp(p.y,0.5,g.H-1.5);
    let ci=g.idx(p.x|0,p.y|0);
    if(!land[ci]){p.x=g.W/2;p.y=g.H/2;ci=g.idx(p.x|0,p.y|0);}

    const [dx,dy]=g.bestDir(p.x|0,p.y|0,j=>{
      if(!land[j]) return -Infinity;
      let prey=0;
      if(isApex){ prey=press[j]/60;
        for(const q of sp.diet) prey+=0;                       // 무리는 press로 대표
      } else for(const q of sp.diet){ const o=w.t2Idx.get(q); if(o!==undefined) prey+=t2d[o*N+j]/140; }
      return prey*1.9+0.5*(1-clamp(wdist[j]/TUNE.waterGradientCells,0,1))+rng()*0.3;
    });
    moveBy(w,p,dx,dy,TUNE.predMoveKmDay[kind]/w.cellKm*sp.moveMul);
    fear[ci]=Math.min(1,fear[ci]+TUNE.fearGain[kind]);
    if((w.year*365+w.day)%TUNE.trackSampleDays===0){
      p.track.push([w.year*365+w.day,p.x,p.y]);
      if(p.track.length>TUNE.trackMaxPoints) p.track.shift();
    }

    let got=0;
    if(isApex){
      /* 홀링 II형 기능반응.
         먹이가 흔하면 처리시간에 막혀 포화하고(= 최대 할당량),
         드물면 조우 자체가 안 되어 굶는다. 포화 구간만 구현하면
         먹이가 줄어도 포식자가 태연해서 수적 연동이 생기지 않는다.
           섭취 = maxKg · (a·P) / (maxKg + a·P)      P = 국소 먹이 생물량 */
      const maxKg=need*TUNE.predKillSurplus;
      const cx=g.xOf(ci), cy=g.yOf(ci);
      const near=[];
      let preyKg=0;
      for(let ddy=-1;ddy<=1;ddy++)for(let ddx=-1;ddx<=1;ddx++){
        if(!g.inside(cx+ddx,cy+ddy)) continue;
        const lst=w.herdAt.get(g.idx(cx+ddx,cy+ddy)); if(!lst) continue;
        for(const h of lst){
          const pref=sp.diet.includes(h.sp)?1:TUNE.predOffDietEff;
          const kg=h.n*species[h.sp].massKg*pref;
          if(kg<=0) continue;
          near.push([h,pref,species[h.sp].massKg]); preyKg+=kg;
        }
      }
      if(preyKg>0){
        const aP=TUNE.predAttackRate*preyKg;
        let remKg=maxKg*aP/(maxKg+aP);          // 조우 제한 ~ 처리 제한 사이
        for(const [h,pref,mk] of near){
          if(remKg<=0) break;
          const t=Math.min(h.n*TUNE.predTakePerHerd*pref, remKg/mk);
          if(t<=0) continue;
          h.n-=t; remKg-=t*mk; w.acc.dYr+=t; w.acc.killYr+=t; got+=t*mk;
          if(t>0.5&&p.kills++===0) addEv(w,p,'hunt',`첫 사냥 성공 — ${species[h.sp].name}`);
        }
      }
      if(w.dens4[ci]>0&&rng()<TUNE.intraguildP*w.dens4[ci]){    // 길드내 포식
        for(let m=w.p4.length-1;m>=0;m--){
          const q=w.p4[m];
          if(g.idx(q.x|0,q.y|0)===ci){
            w.p4.splice(m,1); killInd(w,q,`${sp.name}에게 죽음`);
            got+=species[q.sp].massKg; break;
          }
        }
      }
    }
    const alt=need*TUNE.predAltPreyShare[kind]-got;
    if(alt>0){
      for(const q of sp.diet){
        const oi=w.t2Idx.get(q); if(oi===undefined) continue;
        const o=oi*N+ci; if(t2d[o]<=1) continue;
        const t=Math.min(t2d[o]*0.02,(need*TUNE.predAltPreyShare[kind]-got)/species[q].massKg);
        if(t>0){ t2d[o]-=t; got+=t*species[q].massKg; }
        if(got>=need*TUNE.predAltPreyShare[kind]) break;
      }
    }
    const eff=got/(1+TUNE.predTerritoryK*guildCrowd(w,ci,dens));
    p.e=clamp(p.e+(eff/need-TUNE.predSatietyBreakEven)*TUNE.predEnergyRate,0,1);

    const age=indAge(w,p);
    const senes=age>sp.lifespanYr?0.006:age>sp.lifespanYr*0.8?0.0012:0;
    if(p.e<TUNE.predDeathEnergy){ arr.splice(k,1); killInd(w,p,'아사'); continue; }
    if(senes&&rng()<senes){ arr.splice(k,1); killInd(w,p,'노쇠'); continue; }
    const nSp=bySpecies.get(p.sp)||0;
    const allee=clamp(nSp/ECO.mvpShort,TUNE.alleeFloor,1);
    if(p.e>TUNE.predBreedEnergy&&age>sp.matureYr&&rng()<TUNE.predBreedP*sp.breedMul*allee){
      const c=newInd(w,p.sp,p.x+rng()-.5,p.y+rng()-.5);
      c.e=0.5; arr.push(c); p.offspring++;
      if(p.offspring===1) addEv(w,p,'breed','첫 새끼를 남김');
      bySpecies.set(p.sp,nSp+1);
    }
  }
}
export function immigrate(w){
  if(w.noImmig||w.noPred) return;
  const pDay=TUNE.immigrationPerYear/365;
  for(const [arr,tier] of [[w.p4,'T4'],[w.p5,'T5']]){
    const ids=w.byTier[tier].filter(id=>w.species[id].status!=='ABSENT');
    for(const id of ids){
      const sp=w.species[id], n=arr.filter(p=>p.sp===id).length;
      if(n>=sp.seedN*TUNE.immigrationBelowFrac) continue;
      if(w.rng()>=pDay) continue;
      const {g}=w; let tries=0, ci=-1;
      while(tries++<200){ const c=g.idx((w.rng()*g.W)|0,(w.rng()*g.H)|0);
        if(w.land[c]&&w.wdist[c]<99){ ci=c; break; } }
      if(ci<0) continue;
      for(let i=0;i<TUNE.immigrationFounders;i++)
        arr.push(newInd(w,id,g.xOf(ci)+w.rng(),g.yOf(ci)+w.rng()));
      if(sp.extinctYear!=null){ sp.extinctYear=null; w.totals.extinct--; }
      logChron(w,'gain',`${sp.name} 표류 유입 ${TUNE.immigrationFounders}개체 — 본토에서 상륙`);
    }
  }
}
export function moveBy(w,a,dx,dy,stepC){
  if(!dx&&!dy) return;
  const {g,land}=w, len=Math.hypot(dx,dy);
  let nx=a.x+dx/len*stepC, ny=a.y+dy/len*stepC;
  for(let t=0;t<4;t++){
    const cx=clamp(nx,0.5,g.W-1.5)|0, cy=clamp(ny,0.5,g.H-1.5)|0;
    if(land[g.idx(cx,cy)]){ a.x=clamp(nx,0.5,g.W-1.5); a.y=clamp(ny,0.5,g.H-1.5); return; }
    nx=(nx+a.x)/2; ny=(ny+a.y)/2;
  }
}
export function phaseBookkeeping(w){
  w.day++;
  if(w.day%5===0){ computeWaterDist(w); refreshSpeciesCounts(w); }
  if((w.year*365+w.day)%TUNE.trackSampleDays===0)
    for(const h of w.herds) if(h.lead){
      h.lead.track.push([w.year*365+w.day,h.x,h.y]);
      if(h.lead.track.length>TUNE.trackMaxPoints) h.lead.track.shift();
    }
  if(++w.sampleTick>=w.sampleEvery){ w.sampleTick=0; recordSample(w); }
  if(w.day>=365) closeYear(w);
  watchEvents(w);
}
