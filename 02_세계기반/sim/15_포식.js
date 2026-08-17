/* 섬 생태 시뮬레이터 — [S-4] 하루 4위상 — 포식(개체)
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다. */

/* 포식자는 전부 개체다. 수가 적어(수백~수천) 하루 비용의 4~11%뿐이지만,
   초식을 조절하는 것은 이쪽이다 — T3 사인의 46%가 피식이다. */

import { ECO } from './01_사양상수.js';
import { TUNE } from './02_튜닝상수.js';
import { clamp } from './03_유틸.js';
import { newInd, addEv, killInd, noteKill, linkKin, noteMate, indAge,
         noteCrisis, noteEscape } from './06_개체.js';
import { moveBy, drainDead } from './14_초식.js';
import { logChron } from './09_통계이력.js';

export function phasePredation(w){
  buildPredDensity(w);
  hunt(w,w.p4,false); hunt(w,w.p5,true);
  drainDead(w);
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

export function pickPrey(w,cx,cy,rng){
  const g=w.g, A=w.A, B=w.b;
  for(let tries=0;tries<12;tries++){
    const x=cx+((rng()*3)|0)-1, y=cy+((rng()*3)|0)-1;
    if(!g.inside(x,y)) continue;
    const ci=g.idx(x,y), len=B.cnt[ci];
    if(!len) continue;
    const i=B.start[ci]+((rng()*len)|0);
    if(!A.dead[i]) return i;
  }
  return -1;
}
export function killPrey(w,i,p,sp,species){
  /* 배열 압축은 내일 phaseHerds 가 순회하며 한다. 여기서는 표시만 하고
     살아 있는 수만 즉시 줄인다 — 그래야 [T-12] 예산 판정이 정확하다. */
  const A=w.A;
  A.dead[i]=1; A.deadBy[i]=sp.id; w.deadQ.push(i); w.aniLive--;
  w.acc.killYr++;
  noteKill(w,p,1,species[A.sp[i]].name);
}
/* 사냥은 개체를 표시만 해 두고 여기서 한 번에 걷어낸다.
   사냥 도중에 슬롯을 돌려주면 같은 셀 버킷의 참조가 어긋난다. */

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
  const {g,land,fear,wdist,press,t2d,t1d,species}=w, rng=w.rng, N=g.N;
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
      } else for(const q of sp.diet){
        /* 소형 육식의 먹이는 소형 초식과 분해자다. 마릿수가 아니라 생물량으로
           견줘야 한 자리에 놓인다 — 흰개미 한 마리와 들쥐 한 마리는 다르다. */
        const o2=w.t2Idx.get(q);
        if(o2!==undefined){ prey+=t2d[o2*N+j]*species[q].massKg/280; continue; }
        const o1=w.t1Idx.get(q);
        if(o1!==undefined) prey+=t1d[o1*N+j]*species[q].massKg/280;
      }
      // 굶주린 포식자는 먹이 쪽으로 더 세게 끌린다 (초식과 같은 대칭)
      /* 목마를수록 물 쪽 무게가 커진다 — 초식의 갈증 효용과 같은 꼴이다. */
      return prey*(1.9+TUNE.hungerPull*(1-p.e))
           +(0.5+TUNE.utilThirst*(1-p.hyd))*(1-clamp(wdist[j]/TUNE.waterGradientCells,0,1))
           +rng()*0.3;
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
          if(a<0) break;
          const mk=species[w.A.sp[a]].massKg;
          /* 마지막 한 마리는 남은 할당량만큼의 확률로 잡힌다. 실패하면
             그 개체는 표적이 되었다가 살아난 것이다 — 생애에 남긴다. */
          if(remKg<mk){
            if(rng()<remKg/mk) killPrey(w,a,p,sp,species);
            else noteEscape(w,w.A.ind[a],sp.name);
            break;
          }
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
        /* 소형 초식(t2d)이든 분해자(t1d)든 같은 방식으로 덜어낸다.
           T4 가 선호하는 분해자가 그 칸에 많으면 거기서 배를 채운다 —
           이것이 T4 의 분포를 T1 의 분포에 매어 두는 고리다. */
        const o2=w.t2Idx.get(q), o1=o2===undefined?w.t1Idx.get(q):undefined;
        const fld=o2!==undefined?t2d:(o1!==undefined?t1d:null);
        if(!fld) continue;
        const o=(o2!==undefined?o2:o1)*N+ci;
        if(fld[o]<=1) continue;
        const t=Math.min(fld[o]*0.02,(need*TUNE.predAltPreyShare[kind]-got)/species[q].massKg);
        /* 소형 육식은 무리를 덮치지 못하고 이 경로로만 먹는다.
           여기서 세지 않으면 T4 의 사냥 기록이 영영 0 으로 남는다. */
        if(t>0){ fld[o]-=t; got+=t*species[q].massKg; noteKill(w,p,t,species[q].name); }
        if(got>=need*TUNE.predAltPreyShare[kind]) break;
      }
    }
    const eff=got/(1+TUNE.predTerritoryK*guildCrowd(w,ci,dens));
    /* 물 : 고기에서 얻고, 수원에 닿으면 채운다. 초식의 절반 속도로 마른다.
       배부르면 마르지 않고 굶으면 갈증이 겹친다 — 육식의 물은 먹이에 매여 있다. */
    const wasParched=p.hyd<0.05;
    p.hyd=clamp(p.hyd-1/(TUNE.predHydrationDays*sp.droughtMul)
                +Math.min(eff/need,1)*TUNE.preyMoisture,0,1);
    if(wdist[ci]<=TUNE.drinkRadiusCells){ p.hyd=1;
      if(wasParched) addEv(w,p,'move','말라죽기 직전 수원에 닿음'); }
    p.e=clamp(p.e+(eff/need-TUNE.predSatietyBreakEven)*TUNE.predEnergyRate
              -TUNE.dehydrationPenalty*clamp((TUNE.dehydrationOnset-p.hyd)/TUNE.dehydrationOnset,0,1),0,1);
    noteCrisis(w,p,p.e);              // 포식자도 굶는다. 위기와 극복을 남긴다

    const age=indAge(w,p);
    sp.ageSum+=age; sp.ageN++;
    const senes=age>sp.lifespanYr?0.006:age>sp.lifespanYr*0.8?0.0012:0;
    if(p.e<TUNE.predDeathEnergy){
      /* 초식과 같은 순서로 가른다 — 탈수가 에너지를 깎으므로 갈증을 먼저 본다. */
      const thirsty=p.hyd<TUNE.dehydrationOnset;
      arr.splice(k,1); killInd(w,p,thirsty?'갈증':'아사'); sp.diedYr++;
      if(thirsty) sp.thirstYr++; else sp.starvedYr++;
      continue; }
    if(senes&&rng()<senes){ arr.splice(k,1); killInd(w,p,'노쇠'); sp.diedYr++; sp.agedYr++; continue; }
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
