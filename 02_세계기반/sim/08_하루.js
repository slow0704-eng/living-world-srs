/* 섬 생태 시뮬레이터 — [S-4] 하루 파이프라인 — 배열 순서가 곧 인과다
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

import { ECO } from './01_사양상수.js';
import { TUNE } from './02_튜닝상수.js';
import { clamp, lerp } from './03_유틸.js';
import { newInd, addEv, killInd, noteKill, linkKin, noteMate, indAge } from './06_개체.js';
import { computeWaterDist } from './07_세계생성.js';
import { refreshSpeciesCounts, recordSample, closeYear, watchEvents } from './09_통계이력.js';
import { logChron } from './09_통계이력.js';

export const DAY_PHASES=[
  ['환경',phaseEnvironment], ['화재',phaseFire], ['대형 초식',phaseHerds],
  ['포식',phasePredation], ['기록',phaseBookkeeping],
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
  let sumSoil=0,burning=0,prod=0,sumG=0,sumW=0,capG=0;
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
      if(pm.woody[k]) wi+=plantB[o]; else { gi+=plantB[o]; capG+=capC; }
    }
    grass[i]=gi; woody[i]=wi; sumG+=gi; sumW+=wi;

    for(let k=0;k<nT2;k++){
      if((day+k)%K!==0||!tm.on[k]) continue;
      const o=k*N+i, v=t2d[o];
      if(v<=0) continue;
      let food=0; const dl=tm.diet[k], ml=tm.mul[k];
      for(let m=0;m<dl.length;m++) food+=plantB[dl[m]*N+i]*ml[m];
      // [I-4]와 같은 방식: 가식 먹이 x 종 몫 x 지속채식률 / 개체당 연간 섭취량
      const cap=Math.max(food*tm.share[k]*ECO.sustainableOfftake/tm.intake[k],0.2);
      const nv=v+v*tm.rate[k]*(1-v/cap);
      t2d[o]=nv<0.001?0:nv;
    }
  }
  /* T1 분해자 : 개체가 아니라 하나의 수치다. 그 해 순생산에 부양력이 매이고
     로지스틱으로 따라간다 — 초지가 타거나 마르면 분해자도 함께 줄어든다.
     곤충이라 회전이 빨라 성장률이 크다. */
  {
    /* 부양력은 문서의 npp 가 아니라 '그 해 실제로 자란 양'에 걸린다.
       [I-4] 의 T1 유도값은 기준선이고, 이쪽이 관측이다. */
    const iy1=ECO.bodyMassT1Kg*ECO.dailyIntakeFrac*365/1000;   // 개체당 연간 섭취(t)
    const capNow=Math.max(w.env.prodEMA*ECO.detritusShare/iy1,1);
    if(!(w.n1>0)) w.n1=capNow*0.6;                 // 첫날 생산량을 보고 자리를 잡는다
    /* 리커식으로 따라간다. 덧셈형 로지스틱은 부양력이 갑자기 내려앉으면
       (1 - n/cap)이 큰 음수가 되어 개체수가 음의 무한대로 튄다. 실제로 튀었다. */
    w.n1=Math.min(w.n1*Math.exp((TUNE.t1GrowthPerYr/365)*(1-w.n1/capNow)),capNow*3);
    const t1=w.byTier.T1.filter(id=>w.species[id].status!=='ABSENT');
    let sh=0; for(const id of t1) sh+=w.species[id].share;
    for(const id of t1) w.species[id].n=w.n1*w.species[id].share/Math.max(sh,1e-9);
  }
  Object.assign(w.env,{tempC:s.tempC,rainMm:s.rainMm,soilMm:sumSoil/w.landCount,
    grassT:sumG,woodyT:sumW,woodyFrac:sumW/(w.landCount*w.woodyCap),
    /* 초본이 '지금 자랄 수 있는 최대'까지 얼마나 찼는가.
       현존량만 보면 부양력이 목본에 눌려 줄어든 것인지, 뜯기고 탄 것인지
       구분할 수 없다. T3가 왜 주는지는 이 둘을 나눠 봐야 나온다. */
    grassCapT:capG, grassFill:capG>0?sumG/capG:0,
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

/* ── 대형 초식 : 개체 ────────────────────────────────────────────────
   최소 단위는 개체다. 무리는 객체가 아니라 결과다 — 같은 종끼리 모이려는
   성향과 과밀을 피하려는 성향이 맞물려 뭉치는 것뿐이다 [S-4.1].

   개체 수만 마리를 매일 9칸씩 훑게 하면 하루가 감당이 안 되므로 두 가지를 쓴다.
     1) 셀 효용 필드 : 이동 효용에서 개체와 무관한 부분(먹이 · 공포 · 혼잡 ·
        동종 밀도)을 종마다 하루 한 번 셀 단위로 미리 깐다.
     2) 결정 주기    : 방향은 decideEvery 일마다 다시 고르고 그 사이는 관성으로
        간다. 개체마다 위상을 엇갈려 같은 날 몰리지 않게 한다.
   덕분에 개체 하나의 하루는 '9칸 조회 + 산술 몇 줄'이 된다. */
export function buildMoveFields(w){
  const {g,land,plantB,fear,press,densPrev,util,feedF,wpull,wdist,species}=w, N=g.N;
  const dens=densPrev;                        // 어제의 분포로 오늘을 정한다
  for(let j=0;j<N;j++)
    wpull[j]=land[j]?1-clamp(wdist[j]/TUNE.waterGradientCells,0,1):0;
  /* 먹이 항은 따로 깐다. 개체마다 배고픈 정도가 달라 가중치가 다르기 때문이다 —
     한 필드에 미리 곱해 넣으면 모두가 같은 무게로 먹이를 찾게 된다. */
  for(const id of w.byTier.T3){
    const sp=species[id]; if(sp.status==='ABSENT') continue;
    const o=sp._t3*N, sl=sp._slots, ml=sp._mul;
    for(let j=0;j<N;j++){
      if(!land[j]){ util[o+j]=-Infinity; feedF[o+j]=0; continue; }
      let f=0;
      for(let m=0;m<sl.length;m++) f+=plantB[sl[m]*N+j]*ml[m];
      feedF[o+j]=clamp(f/sp._capRef,0,1);
      const flock=clamp(dens[o+j]/TUNE.flockRef,0,1);      // 어제의 동종 분포
      util[o+j]=TUNE.flockPull*flock
               -TUNE.utilFear*fear[j]-TUNE.utilCrowd*press[j];
    }
  }
}
export function phaseHerds(w){
  const {g,land,wdist,fear,press,util,feedF,wpull,C,species,plantB}=w, rng=w.rng, N=g.N;
  const s=seasonOf(w);
  /* 밀도장은 두 벌을 번갈아 쓴다. 오늘 분포를 채우는 동안 어제 분포가
     그대로 남아 있어야 '어제 그 셀에 몇이 모여 있었나'를 읽을 수 있다. */
  const tmp=w.densPrev; w.densPrev=w.dens; w.dens=tmp;
  buildMoveFields(w);                         // 어제 분포로 오늘의 지형 선호를 깐다
  press.fill(0); w.dens.fill(0);
  const next=w.aniNext, nextCells=w.nextCells;
  for(const ci of nextCells) next[ci].length=0;
  nextCells.length=0;

  const stepGraze=TUNE.moveGrazeKmDay/w.cellKm, stepThirst=TUNE.moveThirstKmDay/w.cellKm;
  const today=w.year*365+w.day;
  const roomToBreed=w.ani.length<w.landCount*TUNE.maxAniPerCell;   // [T-12] 연산 예산
  const nT3=Math.max(1,w.byTier.T3.length);
  const cnt=w.t3Cnt, sat=w.t3Sat;
  let satS=0,satN=0,tracked=0,born=0;
  for(const sp of species) if(sp.trophic==='T3') sp.n=0;

  /* 셀 단위로 돈다. 같은 자리에 있는 개체들은 그 셀의 풀을 나눠 먹는다.
     개체마다 식물 배열을 따로 읽고 쓰면 수만 번의 무작위 접근이 되어
     하루가 감당이 안 된다 — 셀에서 한 번 계산해 나누는 편이 빠르고,
     '먼저 도착한 놈이 다 먹는다'는 순서 편향도 없앤다. */
  for(const ci of w.aniCells){
    const lst=w.aniAt[ci];
    if(!lst.length) continue;
    for(let k=0;k<nT3;k++){ cnt[k]=0; sat[k]=1; }
    for(let m=0;m<lst.length;m++){ const a=lst[m]; if(!a.dead) cnt[species[a.sp]._t3]++; }
    for(let k=0;k<nT3;k++){
      if(!cnt[k]) continue;
      const sp=species[w.byTier.T3[k]], sl=sp._slots, ml=sp._mul;
      let avail=0;
      for(let m=0;m<sl.length;m++) avail+=plantB[sl[m]*N+ci]*ml[m]*C.browseAvailability;
      const demand=cnt[k]*sp.massKg*ECO.dailyIntakeFrac/1000;
      const taken=Math.min(avail,demand);
      if(avail>0&&taken>0) for(let m=0;m<sl.length;m++){
        const o=sl[m]*N+ci;
        plantB[o]-=taken*(plantB[o]*ml[m]/(avail/C.browseAvailability));
      }
      sat[k]=demand>0?taken/demand:1;
      satS+=sat[k]*cnt[k]; satN+=cnt[k];
    }

    for(let m=0;m<lst.length;m++){
      const a=lst[m];
      if(a.dead) continue;
      const sp=species[a.sp], slot=sp._t3;

      /* 물 : 건기마다 마르고 채우기를 반복한다. 죽기 직전이었을 때만 기록에 남긴다. */
      const wasParched=a.hyd<0.05;
      a.hyd=clamp(a.hyd-1/(TUNE.hydrationDays*sp.droughtMul),0,1);
      if(wdist[ci]<=TUNE.drinkRadiusCells){ a.hyd=1;
        if(wasParched&&a.ind) addEv(w,a.ind,'move','말라죽기 직전 수원에 닿음'); }

      a.e=clamp(a.e+(sat[slot]-TUNE.satietyBreakEven)*TUNE.energyGainRate
                -TUNE.dehydrationPenalty*clamp((TUNE.dehydrationOnset-a.hyd)/TUNE.dehydrationOnset,0,1),0,1);

      /* 하루 시작 위치. 상태는 하루에 한 번만 갱신되므로 화면이 그대로 그리면
         개체가 툭툭 튄다. 표현 계층이 이 값과 보간해 잇는다. */
      a.px=a.x; a.py=a.y;

      if(a.hyd<TUNE.thirstSeek){
        /* 목이 마르면 먹이도 무리도 뒤로 밀린다. 셀에 적힌 물 방향을 따라간다. */
        a.dx=w.flowX[ci]+(rng()-0.5)*0.4; a.dy=w.flowY[ci]+(rng()-0.5)*0.4;
      } else if(a.e<TUNE.hungerUrgent||(today+a.phase)%TUNE.decideEvery===0){
        /* 아홉 칸 중 가장 나은 쪽. 셀 성분은 util 에 깔려 있고, 여기서는
           자기 갈증과 자기 허기를 얹는다. 굶주릴수록 먹이 쪽 무게가 커지고
           (허기 절박성), 절박하면 나흘을 기다리지 않고 매일 방향을 고친다. */
        const uo=slot*N, cx=g.xOf(ci), cy=g.yOf(ci);
        const thirst=TUNE.utilThirst*(1-a.hyd);
        const feedW=TUNE.utilFeed+TUNE.hungerPull*(1-a.e);
        let bs=-Infinity, bx=0, by=0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const nx=cx+dx, ny=cy+dy;
          if(nx<0||ny<0||nx>=g.W||ny>=g.H) continue;
          const j=g.idx(nx,ny);
          if(!land[j]) continue;
          const v=util[uo+j]+feedW*feedF[uo+j]+thirst*wpull[j]+rng()*TUNE.utilNoise;
          if(v>bs){ bs=v; bx=dx; by=dy; }
        }
        a.dx=bx; a.dy=by;
      }
      /* 걸음도 절박함을 탄다. 목마르면 물을 찾아 멀리 가고(최대 12배),
         굶주리면 그 절반까지는 더 나선다 — 자리에 앉아 굶지는 않는다. */
      const urge=Math.max(1-a.hyd,TUNE.hungerRoam*(1-a.e));
      moveBy(w,a,a.dx,a.dy,lerp(stepGraze,stepThirst,urge)*sp.moveMul);

      const ni=g.idx(clamp(a.x|0,0,g.W-1),clamp(a.y|0,0,g.H-1));
      press[ni]+=1; w.dens[slot*N+ni]+=1;
      let nl=next[ni];
      if(!nl) nl=next[ni]=[];
      if(!nl.length) nextCells.push(ni);
      nl.push(a);
      sp.n++;

      if(a.ind){
        tracked++;
        const ind=a.ind;
        ind.x=a.x; ind.y=a.y; ind.px=a.px; ind.py=a.py; ind.e=a.e; ind.hyd=a.hyd;
        /* '최대 무리'는 어제 그 자리에 함께 있던 동종의 수다.
           무리라는 객체가 없으니 업적도 모인 결과로 잰다. */
        const together=w.densPrev[slot*N+ci];
        if(together>ind.peakHerd){
          const was=ind.peakHerd; ind.peakHerd=together;
          for(const mark of [50,100,200,400])
            if(was<mark&&together>=mark) addEv(w,ind,'move',`${mark}마리 무리 속에 있었음`);
        }
        if(today%TUNE.trackSampleDays===0){
          ind.track.push([today,a.x,a.y]);
          if(ind.track.length>TUNE.trackMaxPoints) ind.track.shift();
        }
      }

      /* 번식 : 우기에 에너지가 남은 암컷이, 곁에 수컷이 있을 때 낳는다.
         짝을 요구하면 밀도가 낮을 때 번식이 저절로 막힌다(앨리 효과).
         낳는 쪽을 암컷으로 한정했으므로 확률은 두 배로 둔다 — 개체군 수준의
         출생률은 무리 시절과 같게 유지하고, 짝 찾기 실패만 새로 더해진 것이다. */
      if(s.wet&&roomToBreed&&!a.male){
        const p=TUNE.birthRate*2*sp.breedMul*clamp((a.e-TUNE.birthEnergyMin)/TUNE.birthEnergySpan,0,1);
        if(p>0&&rng()<p){
          const mate=findMate(w,a,ci,rng);
          if(mate){
          const c=newAnimal(w,a.sp,a.x+rng()-.5,a.y+rng()-.5,today);
          c.e=0.5; w.ani.push(c); born++; sp.bornYr++;
          const cj=g.idx(clamp(c.x|0,0,g.W-1),clamp(c.y|0,0,g.H-1));
          let cl=next[cj];
          if(!cl) cl=next[cj]=[];
          if(!cl.length) nextCells.push(cj);
          cl.push(c); sp.n++;
          if(mate.ind) mate.ind.offspring++;
          /* 한쪽만 추적 중이면 짝도 올린다. 그러지 않으면 배우자와 형제가
             기록에 거의 남지 않는다 — 표본끼리 만날 확률이 낮기 때문이다. */
          if(a.ind&&!mate.ind&&w.trackedAlive<TUNE.trackedAlive) attachInd(w,mate);
          if(a.ind||mate.ind){
            if(a.ind){
              a.ind.offspring++;
              if(a.ind.offspring===1) addEv(w,a.ind,'breed','첫 새끼를 남김');
            }
            /* 부모를 추적 중이면 자식도 추적해 계보를 잇는다.
               그래야 생애 화면에서 부모와 자식을 오갈 수 있다. */
            if(!c.ind&&w.trackedAlive<TUNE.trackedAlive) attachInd(w,c);
            if(c.ind){
              linkKin(w,a.ind,c.ind,mate.ind);
              const who=a.ind?a.ind.name:mate.ind.name;
              addEv(w,c.ind,'birth',`${who}의 새끼로 태어남`);
            }
            if(a.ind&&mate.ind) noteMate(w,a.ind,mate.ind);
          }
          }
        }
      }
      /* 죽음 : 굶주림 · 갈증 · 노쇠. 무리 시절에는 사망률이 마릿수에 곱해지는
         연속량이었지만, 이제는 이 한 마리가 죽느냐 마느냐다. */
      const age=(today-a.bornDay)/365;
      sp.ageSum+=age; sp.ageN++;
      const senes=age>sp.lifespanYr?0.006:age>sp.lifespanYr*0.8?0.0012:0;
      const dp=TUNE.deathRate*clamp((TUNE.deathEnergyMax-a.e)/TUNE.deathEnergyMax,0,1)+senes;
      if(dp>0&&rng()<dp){
        a.dead=true;
        a.deadBy=null;
        a.cause=a.e<TUNE.deathEnergyMax*0.5?'아사':a.hyd<0.05?'갈증':'노쇠';
        w.aniKilled=true;
      }
    }
  }
  /* 버킷을 맞바꾼다. 오늘 채운 것이 내일의 '어제 자리'가 된다. */
  w.aniAt=next; w.aniCells=nextCells;
  w.aniNext=w.aniAt===w.aniA?w.aniB:w.aniA;
  w.nextCells=w.aniCells===w.cellsA?w.cellsB:w.cellsA;
  w.acc.bYr+=born;
  if(w.aniKilled) sweepDead(w);
  w.env.satiety=satN?satS/satN:1;
  w.trackedAlive=tracked;
}
/* 개체 하나를 만든다. 표본만 이름 · 동선 · 사건을 갖는다 —
   수만 마리 전부에 붙이면 이름 문자열과 배열만으로 메모리가 무너진다. */
export function newAnimal(w,spId,x,y,bornDay){
  const a={ sp:spId, x, y, px:x, py:y, e:0.7, hyd:1, male:w.rng()<0.5,
            bornDay, dx:0, dy:0, phase:(w.uid*7)%TUNE.decideEvery, ind:null };
  if(w.trackedAlive<TUNE.trackedAlive&&w.rng()<TUNE.trackedRate) attachInd(w,a);
  return a;
}
/* 추적 대상으로 승격한다. 지도에서 고른 개체도 이 길로 들어온다. */
export function attachInd(w,a){
  if(a.ind) return a.ind;
  const ind=newInd(w,a.sp,a.x,a.y);
  ind.bornDay=a.bornDay; ind.e=a.e; ind.hyd=a.hyd; ind.animal=a;
  ind.sex=a.male?'M':'F';
  a.ind=ind; w.trackedAlive++;
  return ind;
}
export function removeAnimal(w,ai,cause){
  const a=w.ani[ai];
  if(a.ind){ killInd(w,a.ind,cause); a.ind.animal=null; w.trackedAlive--; }
  const last=w.ani.length-1;
  if(ai!==last) w.ani[ai]=w.ani[last];
  w.ani.pop();
  w.species[a.sp].n--;
  w.acc.dYr++;
}
export function phasePredation(w){
  buildPredDensity(w);
  hunt(w,w.p4,false); hunt(w,w.p5,true);
  if(w.aniKilled) sweepDead(w);
  immigrate(w);
}
/* 포식자의 짝. 세력권이 넓어 몇 킬로미터 안이면 만난 것으로 본다. */
export function findPredMate(w,arr,p){
  const R=TUNE.mateRadiusCells;
  for(const q of arr){
    if(q===p||q.sp!==p.sp||q.sex===p.sex) continue;
    if(Math.abs(q.x-p.x)<=R&&Math.abs(q.y-p.y)<=R) return q;
  }
  return null;
}
/* 곁의 짝을 찾는다. 자기 칸부터 보고 없으면 이웃 여덟 칸까지.
   못 찾으면 그 해에는 낳지 못한다 — 밀도가 낮으면 번식이 저절로 막힌다. */
export function findMate(w,a,ci,rng){
  const g=w.g, cx=g.xOf(ci), cy=g.yOf(ci);
  for(let r=0;r<2;r++){
    const lst=r===0?w.aniAt[ci]:null;
    if(r===0){
      if(lst) for(let k=0;k<lst.length;k++){
        const b=lst[(k+((rng()*lst.length)|0))%lst.length];
        if(b!==a&&!b.dead&&b.sp===a.sp&&b.male!==a.male) return b;
      }
      continue;
    }
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy) continue;
      if(!g.inside(cx+dx,cy+dy)) continue;
      const nl=w.aniAt[g.idx(cx+dx,cy+dy)];
      if(!nl||!nl.length) continue;
      for(let k=0;k<nl.length;k++){
        const b=nl[k];
        if(!b.dead&&b.sp===a.sp&&b.male!==a.male) return b;
      }
    }
  }
  return null;
}
/* 주변 아홉 칸에서 살아 있는 먹이 하나를 집는다. 없으면 null. */
function pickPrey(w,cx,cy,rng){
  const g=w.g;
  for(let tries=0;tries<12;tries++){
    const x=cx+((rng()*3)|0)-1, y=cy+((rng()*3)|0)-1;
    if(!g.inside(x,y)) continue;
    const lst=w.aniAt[g.idx(x,y)];
    if(!lst||!lst.length) continue;
    const a=lst[(rng()*lst.length)|0];
    if(a&&!a.dead) return a;
  }
  return null;
}
function killPrey(w,a,p,sp,species){
  a.dead=true; a.deadBy=sp.name; w.aniKilled=true;
  w.acc.killYr++;
  noteKill(w,p,1,species[a.sp].name);
}
/* 사냥은 개체를 표시만 해 두고 여기서 한 번에 걷어낸다.
   사냥 도중에 배열에서 빼면 같은 셀 목록(aniAt)의 참조가 어긋난다. */
export function sweepDead(w){
  let k=0;
  for(let i=0;i<w.ani.length;i++){
    const a=w.ani[i];
    if(a.dead){
      if(a.ind){ killInd(w,a.ind,a.deadBy?`${a.deadBy}에게 죽음`:(a.cause||'죽음'));
        a.ind.animal=null; w.trackedAlive--; }
      const dsp=w.species[a.sp];
      dsp.n--; w.acc.dYr++;
      if(a.deadBy) dsp.eatenYr++; else dsp.diedYr++;
    } else w.ani[k++]=a;
  }
  w.ani.length=k;
  w.aniKilled=false;
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
      // 굶주린 포식자는 먹이 쪽으로 더 세게 끌린다 (초식과 같은 대칭)
      return prey*(1.9+TUNE.hungerPull*(1-p.e))+0.5*(1-clamp(wdist[j]/TUNE.waterGradientCells,0,1))+rng()*0.3;
    });
    p.px=p.x; p.py=p.y;                       // 화면 보간용 (하루 시작 위치)
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
      /* 먹이 생물량은 밀도장에서 읽는다. 주변 셀의 개체를 전부 배열에 모으면
         셀당 수백 마리 x 포식자 수백 마리가 되어 하루가 통째로 여기서 간다.
         실제로 잡는 것은 보통 하루 0~1마리이므로, 그때만 개체를 집으면 된다. */
      let preyKg=0;
      for(let ddy=-1;ddy<=1;ddy++)for(let ddx=-1;ddx<=1;ddx++){
        if(!g.inside(cx+ddx,cy+ddy)) continue;
        const j=g.idx(cx+ddx,cy+ddy);
        for(const pid of w.byTier.T3){
          const psp=species[pid]; if(psp.status==='ABSENT') continue;
          const d=w.dens[psp._t3*N+j];
          if(d>0) preyKg+=d*psp.massKg*(sp.diet.includes(pid)?1:TUNE.predOffDietEff);
        }
      }
      if(preyKg>0){
        const aP=TUNE.predAttackRate*preyKg;
        const allow=maxKg*aP/(maxKg+aP);        // 조우 제한 ~ 처리 제한 사이
        /* 먹이가 개체가 되면서 갈라진다.
             에너지 : 하루 할당량(allow)을 그대로 쓴다 - 연속 근사.
             죽음   : 그 할당량에 해당하는 만큼 실제 개체를 죽인다 - 이산.
           둘을 함께 이산화하면(잡은 날만 먹는다) 80kg짜리 한 마리를 하루치
           1.7kg 확률로 잡게 되어 에너지가 요동치고, clamp 때문에 기댓값이
           보존되지 않아 포식자가 통째로 굶어 죽는다. 실제로 그렇게 됐다.
           큰 사냥감 하나를 여러 날 나눠 먹는 것을 연속 근사가 대신한다. */
        got+=Math.min(allow,preyKg);
        let remKg=allow, guard=0;
        while(remKg>0&&guard++<8){
          const a=pickPrey(w,cx,cy,rng);
          if(!a) break;
          const mk=species[a.sp].massKg;
          if(remKg<mk){ if(rng()<remKg/mk) killPrey(w,a,p,sp,species); break; }
          killPrey(w,a,p,sp,species); remKg-=mk;
        }
      }
      if(w.dens4[ci]>0&&rng()<TUNE.intraguildP*w.dens4[ci]){    // 길드내 포식
        for(let m=w.p4.length-1;m>=0;m--){
          const q=w.p4[m];
          if(g.idx(q.x|0,q.y|0)===ci){
            w.p4.splice(m,1); killInd(w,q,`${sp.name}에게 죽음`); species[q.sp].eatenYr++;
            noteKill(w,p,1,species[q.sp].name);
            addEv(w,p,'hunt',`길드내 포식 — ${q.name}`);
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
        /* 소형 육식은 무리를 덮치지 못하고 이 경로로만 먹는다.
           여기서 세지 않으면 T4 의 사냥 기록이 영영 0 으로 남는다. */
        if(t>0){ t2d[o]-=t; got+=t*species[q].massKg; noteKill(w,p,t,species[q].name); }
        if(got>=need*TUNE.predAltPreyShare[kind]) break;
      }
    }
    const eff=got/(1+TUNE.predTerritoryK*guildCrowd(w,ci,dens));
    p.e=clamp(p.e+(eff/need-TUNE.predSatietyBreakEven)*TUNE.predEnergyRate,0,1);

    const age=indAge(w,p);
    sp.ageSum+=age; sp.ageN++;
    const senes=age>sp.lifespanYr?0.006:age>sp.lifespanYr*0.8?0.0012:0;
    if(p.e<TUNE.predDeathEnergy){ arr.splice(k,1); killInd(w,p,'아사'); sp.diedYr++; continue; }
    if(senes&&rng()<senes){ arr.splice(k,1); killInd(w,p,'노쇠'); sp.diedYr++; continue; }
    const nSp=bySpecies.get(p.sp)||0;
    const allee=clamp(nSp/ECO.mvpShort,TUNE.alleeFloor,1);
    /* 포식자도 암컷이 낳고, 곁에 수컷이 있어야 한다. 낳는 쪽을 절반으로
       한정했으므로 확률은 두 배다. 세력권이 넓어 짝 찾기 반경도 넓게 본다. */
    if(p.sex==='F'&&p.e>TUNE.predBreedEnergy&&age>sp.matureYr
       &&rng()<TUNE.predBreedP*2*sp.breedMul*allee){
      const mate=findPredMate(w,arr,p);
      if(mate){
        const c=newInd(w,p.sp,p.x+rng()-.5,p.y+rng()-.5);
        c.e=0.5; arr.push(c); p.offspring++; mate.offspring++; sp.bornYr++;
        linkKin(w,p,c,mate); noteMate(w,p,mate);
        addEv(w,c,'birth',`${p.name}의 새끼로 태어남`);
        if(p.offspring===1) addEv(w,p,'breed','첫 새끼를 남김');
        bySpecies.set(p.sp,nSp+1);
      }
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
  /* Math.hypot 은 정확도를 지키느라 느리다. 하루 수만 번 부르는 자리라
     제곱근으로 직접 계산한다(값의 범위가 좁아 넘칠 일이 없다). */
  const {g,land}=w, len=Math.sqrt(dx*dx+dy*dy);
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
  if(++w.sampleTick>=w.sampleEvery){ w.sampleTick=0; recordSample(w); }
  if(w.day>=365) closeYear(w);
  watchEvents(w);
}
