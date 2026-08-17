/* 섬 생태 시뮬레이터 — [C-5] · [I-6.4] 종 로스터 구성
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다. */

import { CLIMATE_PROFILES, ISLAND_TIERS, ECO, NAME_POOL } from './01_사양상수.js';
import { TUNE } from './02_튜닝상수.js';
import { clamp, rankShares } from './03_유틸.js';

/* 몫 순위 -> 최적 기온 위치. 0 이 기후 최적이다. */
const PLANT_TEMP_ORDER=[0,-0.5,0.5,-1,1];
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
    /* 식물은 기능군마다 다른 이름 통에서 뽑는다 — 초본이 '덤불나무'로,
       목본이 '마른풀'로 불리면 화면이 거짓말을 한다. */
    const nGrass=tier==='T0'?Math.round(n*C.grassSpeciesFrac):0;
    const names=tier==='T0'
      ? pick(pool.T0g||[],nGrass).concat(pick(pool.T0w||[],n-nGrass))
      : pick(pool[tier]||[],n);
    const shares=rankShares(n,TUNE.rankAbundanceRatio);
    for(let i=0;i<n;i++){
      const id=species.length;
      const sp={ id, name:names[i], trophic:tier, share:shares[i],
                 kind: tier==='T0'?'PLANT':'ANIMAL', status:'VIABLE', n:0, extinctYear:null,
                 /* 그 해의 종별 집계. 연 마감에 발자취로 접히고 0으로 돌아간다. */
                 /* diedYr 은 피식이 아닌 죽음의 합이고, 아래 셋이 그 내역이다.
                    셋을 더하면 diedYr 이 된다 — 따로 세는 이유는 "무엇이
                    이 종을 깎았는가"가 마릿수보다 먼저 알아야 할 것이기 때문이다. */
                 bornYr:0, diedYr:0, eatenYr:0,
                 starvedYr:0, thirstYr:0, agedYr:0, ageSum:0, ageN:0 };
      if(tier==='T0'){
        sp.woody = i >= Math.round(n*C.grassSpeciesFrac);
        sp.droughtTol = clamp(C.droughtToleranceMin+rand()*(1-C.droughtToleranceMin),0,1);
        /* 최적 기온을 종마다 달리 준다. 고도가 오르면 기온이 내려가므로
           (-6.5℃/km) 높은 곳에서는 서늘한 쪽이, 낮은 곳에서는 더운 쪽이
           우세해진다 — 우세종이 지형을 탄다. 내건성과 함께 걸리면
           '높고 마른 곳', '낮고 젖은 곳'이 서로 다른 종의 자리가 된다. */
        /* 몫이 가장 큰 종을 기후 최적에 앉히고 나머지를 양옆으로 벌린다.
           순서대로 늘어놓으면 '몫이 크고 서늘한' 종이 어디서나 이겨
           우세종이 뒤집히지 않는다 — 실제로 그렇게 나왔다.

           자리는 기능군 안에서 센다. 통째로 세면 마지막인 목본이 늘 가장자리
           오프셋을 받아 체계적으로 불리해진다 — 목본 임관이 26%에서 16%로
           내려앉았다. 경쟁은 같은 기능군 안에서 일어나므로 이쪽이 맞다. */
        const inGroup = sp.woody ? i-nGrass : i;
        sp.tempOpt = C.tempOptC + (PLANT_TEMP_ORDER[inGroup]||0)*TUNE.plantTempSpreadC;
        sp.simulated = false;         // 아래에서 상위 몫부터 시뮬 대상으로 승격
      } else if(tier==='T1'){
        /* 분해자도 종별 x 셀 밀도장이다. 내건성이 갈리면 마른 칸과 젖은 칸의
           우세종이 달라지고, 그 분포를 소형 육식이 따라간다. */
        sp.massKg=0.002;
        /* 곤충이라 짧다. 밀도장이므로 동역학에는 쓰이지 않고 표시용이지만,
           비워 두면 결과 직렬화가 깨진다(T1 은 예전에 aggregate 라 빠졌다). */
        sp.lifespanYr=0.5; sp.matureYr=0.1; sp.breedMul=1; sp.moveMul=1;
        /* 최적 토양수분을 종마다 벌려 놓는다. 무작위로 뽑으면 값이 붙어
           (0.89 vs 0.91) 공간이 갈리지 않았다. 분해자는 '젖은 자리의 지렁이'와
           '마른 자리의 흰개미'처럼 극단이 공존하는 무리다. */
        sp.soilOpt = n>1 ? TUNE.t1SoilOptLoMm+(i/(n-1))*(TUNE.t1SoilOptHiMm-TUNE.t1SoilOptLoMm)
                         : (TUNE.t1SoilOptLoMm+TUNE.t1SoilOptHiMm)/2;
        sp.droughtTol = clamp(1-(sp.soilOpt-TUNE.t1SoilOptLoMm)
                        /(TUNE.t1SoilOptHiMm-TUNE.t1SoilOptLoMm),0,1);
      } else {
        const base = tier==='T2'?ECO.bodyMassT2Kg : tier==='T3'?cap.bodyMassT3Kg
                   : tier==='T4'?ECO.bodyMassT4Kg : ECO.bodyMassT5Kg;
        sp.massKg = massOf(base);
        sp.droughtTol = clamp(C.droughtToleranceMin+rand()*(1-C.droughtToleranceMin),0,1);
        sp.grazerFrac = rand();                               // 0 잎따먹기 ~ 1 풀뜯기
        sp.lifespanYr = TUNE.lifespanFromMass.a*Math.pow(sp.massKg,TUNE.lifespanFromMass.b);
        sp.matureYr = sp.lifespanYr*(tier==='T4'||tier==='T5'
                        ? TUNE.matureFrac.pred : TUNE.matureFrac.herb);
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
  /* 소형 육식은 소형 초식과 분해자(곤충)를 함께 먹는다. 오소리 · 사향고양이가
     흰개미를 파먹는 쪽이 실제로 그렇고, 이렇게 해야 T4 의 분포가 T1 의 분포를
     따라간다 — '먹이가 어디 많은가'가 포식자를 옮긴다.
     한 등급에서 하나씩만 고르므로 종마다 선호하는 분해자가 갈린다. */
  const pickTop=(cands,k)=>{
    if(!cands.length) return [];
    const scored=cands.map(id=>({id,w:species[id].share*(0.4+rand())}));
    scored.sort((a,b)=>b.w-a.w);
    return scored.slice(0,k).map(o=>o.id);
  };
  /* 분해자는 낙엽을 먹는다. 종마다 주된 낙엽을 달리 주면, 그 낙엽을 내는
     식물이 우세한 칸에서 그 분해자가 우세해진다 — 지형이 T0 을 가르고,
     T0 이 T1 을 가르고, T1 이 T4 를 옮긴다. */
  byTier.T1.forEach((id,k)=>{
    species[id].diet = simPlants.length ? [simPlants[k%simPlants.length]] : [];
  });
  for(const id of byTier.T4)
    species[id].diet=pickTop(byTier.T2,2).concat(pickTop(byTier.T1,1));
  for(const id of byTier.T5) species[id].diet=dietFrom(byTier.T3,species[id],3+((rand()*3)|0));

  /* [I-6.1] 최소존속개체군을 '종마다' 판정한다.
     등급 전체가 건강해도 몫이 작은 종은 애초에 성립하지 않는다. */
  const iy = kg => kg*ECO.dailyIntakeFrac*365/1000;
  const alloc=(ids,budgetTon)=>{ for(const id of ids){ const sp=species[id];
    sp.seedN=Math.round(budgetTon*sp.share/iy(sp.massKg)); } };
  alloc(byTier.T2, cap.forageT2TonYr);
  alloc(byTier.T3, cap.forageT3TonYr);
  /* T1 은 유도 부양력을 몫대로 나눈다(밀도장이라 개체를 놓지는 않는다) */
  for(const id of byTier.T1) species[id].seedN=Math.round(cap.T1*species[id].share);
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
