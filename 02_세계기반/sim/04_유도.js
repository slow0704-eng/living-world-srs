/* 섬 생태 시뮬레이터 — [I-4] 면적과 기후만으로 부양 개체수를 낸다
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

import { CLIMATE_PROFILES, ISLAND_TIERS, ECO } from './01_사양상수.js';

export function deriveCapacity(tierKey, climateKey){
  const T=ISLAND_TIERS[tierKey], C=CLIMATE_PROFILES[climateKey];
  const F  = C.nppTonPerKm2Yr * C.browseAvailability * ECO.sustainableOfftake;
  const iy = kg => kg * ECO.dailyIntakeFrac * 365 / 1000;
  const eff= T.areaKm2 * T.habitableFrac;
  const m3 = C.bodyMassT3Kg * (T.dwarf ? ECO.dwarfFactor : 1);
  const d2 = F*C.splitT2/iy(ECO.bodyMassT2Kg), d3 = F*C.splitT3/iy(m3);
  const pred=(d2*ECO.bodyMassT2Kg + d3*m3)*ECO.predatorBiomassFrac;
  return { effKm2:eff, bodyMassT3Kg:m3,
    forageT2TonYr:F*C.splitT2*eff, forageT3TonYr:F*C.splitT3*eff,
    predBiomassKg:pred*eff,
    T2:Math.round(d2*eff), T3:Math.round(d3*eff),
    T4:Math.round(pred*ECO.splitT4/ECO.bodyMassT4Kg*eff),
    T5:Math.round(pred*ECO.splitT5/ECO.bodyMassT5Kg*eff) };
}
export const viability = n => n>=ECO.mvpLong ? '자립' : n>=ECO.mvpShort ? '준자립' : n>0 ? '위기' : '절멸';
