/* 섬 생태 시뮬레이터 — [C-5] · [I-6.4] 종 로스터 구성
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

import { CLIMATE_PROFILES, ISLAND_TIERS, ECO, NAME_POOL } from './01_사양상수.js';
import { TUNE } from './02_튜닝상수.js';
import { clamp, rankShares } from './03_유틸.js';

export function buildRoster(tierKey, climateKey, cap, rand){
  const T=ISLAND_TIERS[tierKey], C=CLIMATE_PROFILES[climateKey], pool=NAME_POOL[climateKey];
  const total=Math.round(ECO.richnessBase*Math.pow(T.areaKm2/1000,ECO.richnessExp)*C.richnessFactor);
  const species=[], byTier={T0:[],T1:[],T2:[],T3:[],T4:[],T5:[]};
  const pick=(arr,k)=>{                     // 시드 결정론적 비복원 추출
    const c=arr.slice(), out=[];
    for(let i=0;i<k&&c.length;i++) out.push(c.splice((rand()*c.length)|0,1)[0]);
    while(out.length<k) out.push(out.length? out[0]+' '+(out.length+1) : '이름없는종');
    return out;
  };
  const massOf=(base)=>base*Math.exp((rand()*2-1)*TUNE.massSpreadLog);

  for(const tier of ['T0','T1','T2','T3','T4','T5']){
    const planned=Math.max(1,Math.round(total*C.mix[tier]));
    const n=Math.min(planned,TUNE.speciesMax[tier]);
    const names=pick(pool[tier]||[],n), shares=rankShares(n,TUNE.rankAbundanceRatio);
    for(let i=0;i<n;i++){
      const id=species.length;
      const sp={ id, name:names[i], trophic:tier, share:shares[i],
                 kind: tier==='T0'?'PLANT':'ANIMAL', status:'VIABLE', n:0, extinctYear:null };
      if(tier==='T0'){
        sp.woody = i >= Math.round(n*C.grassSpeciesFrac);
        sp.droughtTol = clamp(C.droughtToleranceMin+rand()*(1-C.droughtToleranceMin),0,1);
        sp.simulated = false;         // 아래에서 상위 몫부터 시뮬 대상으로 승격
      } else if(tier==='T1'){
        sp.massKg=0.002; sp.droughtTol=0.9; sp.aggregate=true;   // 집계만 한다
      } else {
        const base = tier==='T2'?ECO.bodyMassT2Kg : tier==='T3'?cap.bodyMassT3Kg
                   : tier==='T4'?ECO.bodyMassT4Kg : ECO.bodyMassT5Kg;
        sp.massKg = massOf(base);
        sp.droughtTol = clamp(C.droughtToleranceMin+rand()*(1-C.droughtToleranceMin),0,1);
        sp.grazerFrac = rand();                               // 0 잎따먹기 ~ 1 풀뜯기
        sp.lifespanYr = TUNE.lifespanFromMass.a*Math.pow(sp.massKg,TUNE.lifespanFromMass.b);
        sp.matureYr = sp.lifespanYr*0.22;
        sp.breedMul = Math.pow(sp.massKg/base,-0.25);          // 알로메트리 : 작을수록 빨리 번식
        // 내건성 배율도 중립화한다(0.7~1.3). 원시값을 그대로 곱하면
        // 사바나 전 종이 물 없이 30% 더 버텨 건기 수원 병목이 통째로 풀린다.
        sp.droughtMul = 0.7+0.6*(sp.droughtTol-C.droughtToleranceMin)
                        /Math.max(1-C.droughtToleranceMin,1e-6);
        sp.moveMul  = Math.pow(sp.massKg/base, 0.20);
      }
      species.push(sp); byTier[tier].push(id);
    }
  }
  /* 식물은 기능군(초본/목본)마다 따로 순위-풍부도를 매기고, 각 군에서 상위 몇 종만
     셀 단위로 시뮬한다. 전체 몫 순으로 뽑으면 목본이 하나도 안 뽑혀
     [C-4.6] 화재-목본-초지 연쇄가 통째로 죽는다. */
  const grassIds=byTier.T0.filter(id=>!species[id].woody);
  const woodyIds=byTier.T0.filter(id=>species[id].woody);
  const simPlants=[];
  for(const [ids,maxN] of [[grassIds,TUNE.simGrassMax],[woodyIds,TUNE.simWoodyMax]]){
    if(!ids.length) continue;
    const sh=rankShares(ids.length,TUNE.rankAbundanceRatio);
    ids.forEach((id,k)=>species[id].share=sh[k]);
    const top=ids.slice(0,maxN);
    let tot=0; for(const id of top) tot+=species[id].share;
    for(const id of top){ species[id].simulated=true; species[id].simShare=species[id].share/tot; }
    simPlants.push(...top);
  }

  /* [C-5.2] 식이폭 >= 2 강제. 대체재는 코드가 아니라 이 데이터에서 나온다. */
  const dietFrom=(cands,sp,k)=>{
    if(!cands.length) return [];
    const scored=cands.map(id=>({id,w:species[id].share*(0.4+rand())}));
    scored.sort((a,b)=>b.w-a.w);
    return scored.slice(0,Math.max(TUNE.dietWidthMin,k)).map(o=>o.id);
  };
  for(const id of byTier.T2) species[id].diet=dietFrom(simPlants,species[id],2+((rand()*2)|0));
  for(const id of byTier.T3){
    const sp=species[id];
    // 풀뜯기 성향이 높으면 초본을, 낮으면 목본을 우선한다
    const pref=simPlants.filter(p=>species[p].woody===(sp.grazerFrac<0.5));
    const rest=simPlants.filter(p=>!pref.includes(p));
    sp.diet=dietFrom(pref.concat(rest),sp,2+((rand()*3)|0));
  }
  for(const id of byTier.T4) species[id].diet=dietFrom(byTier.T2,species[id],2+((rand()*2)|0));
  for(const id of byTier.T5) species[id].diet=dietFrom(byTier.T3,species[id],3+((rand()*3)|0));

  /* [I-6.1] 최소존속개체군을 '종마다' 판정한다.
     등급 전체가 건강해도 몫이 작은 종은 애초에 성립하지 않는다. */
  const iy = kg => kg*ECO.dailyIntakeFrac*365/1000;
  const alloc=(ids,budgetTon)=>{ for(const id of ids){ const sp=species[id];
    sp.seedN=Math.round(budgetTon*sp.share/iy(sp.massKg)); } };
  alloc(byTier.T2, cap.forageT2TonYr);
  alloc(byTier.T3, cap.forageT3TonYr);
  for(const [ids,frac,mass] of [[byTier.T4,ECO.splitT4,ECO.bodyMassT4Kg],
                                [byTier.T5,ECO.splitT5,ECO.bodyMassT5Kg]])
    for(const id of ids){ const sp=species[id];
      sp.seedN=Math.round(cap.predBiomassKg*frac*sp.share/sp.massKg); }
  for(const tier of ['T2','T3','T4','T5']) for(const id of byTier[tier]){
    const sp=species[id];
    if(sp.seedN<ECO.mvpShort){ sp.status='ABSENT'; sp.seedN=0; }
    else if(sp.seedN<ECO.mvpLong) sp.status='SEMI_VIABLE';
  }
  return {species, byTier, simPlants, totalPlanned:total};
}
