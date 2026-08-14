/* 섬 생태 시뮬레이터 — [I-4] 면적과 기후만으로 부양 개체수를 낸다
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다. */

import { CLIMATE_PROFILES, ISLAND_TIERS, ECO } from './01_사양상수.js';

export function deriveCapacity(tierKey, climateKey){
  const T=ISLAND_TIERS[tierKey], C=CLIMATE_PROFILES[climateKey];
  const F  = C.nppTonPerKm2Yr * C.browseAvailability * ECO.sustainableOfftake;
  const iy = kg => kg * ECO.dailyIntakeFrac * 365 / 1000;
  const eff= T.areaKm2 * T.habitableFrac;
  const m3 = C.bodyMassT3Kg * (T.dwarf ? ECO.dwarfFactor : 1);
  const d2 = F*C.splitT2/iy(ECO.bodyMassT2Kg), d3 = F*C.splitT3/iy(m3);
  const pred=(d2*ECO.bodyMassT2Kg + d3*m3)*ECO.predatorBiomassFrac;
  /* T1 분해자 : 초식이 먹고 남긴 유기물이 이들의 밥이다.
     문서에는 T1의 개체수 유도가 없다([C-5.3]은 종 수 비율만 준다).
     그래서 [I-4]와 같은 형식으로 새로 세운다 — 근거는 문서가 아니라 이 식이다.
       분해 가능 유기물 = 순생산 x 분해자 몫
       T1 = 그 유기물 / 개체당 연간 섭취량 */
  const detritus=C.nppTonPerKm2Yr*ECO.detritusShare;
  const d1=detritus/iy(ECO.bodyMassT1Kg);
  return { effKm2:eff, bodyMassT3Kg:m3, detritusTonYr:detritus*eff,
    T1:Math.round(d1*eff),
    forageT2TonYr:F*C.splitT2*eff, forageT3TonYr:F*C.splitT3*eff,
    predBiomassKg:pred*eff,
    T2:Math.round(d2*eff), T3:Math.round(d3*eff),
    T4:Math.round(pred*ECO.splitT4/ECO.bodyMassT4Kg*eff),
    T5:Math.round(pred*ECO.splitT5/ECO.bodyMassT5Kg*eff) };
}
export const viability = n => n>=ECO.mvpLong ? '자립' : n>=ECO.mvpShort ? '준자립' : n>0 ? '위기' : '절멸';
