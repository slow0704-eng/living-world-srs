/* 섬 생태 시뮬레이터 — [S-4] 하루 파이프라인 — 배열 순서가 곧 인과다
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다. */

/* 이 파일에는 '순서'만 둔다. 각 위상의 알맹이는 옆 모듈에 있다 —
   한 파일이 660줄이 되자 환경 · 화재 · 초식 · 포식이 서로를 가렸다.
     13_환경과화재.js  셀 격자만 만지는 두 위상 + 계절
     14_초식.js        개체 위상. 하루 비용의 대부분 + 이동
     15_포식.js        개체 위상. 초식을 조절한다
   의존은 한 방향이다. 13 <- 14 <- 15 이고 이 파일이 셋을 엮는다. */

import { computeWaterDist } from './07_세계생성.js';
import { refreshSpeciesCounts, recordSample, closeYear, watchEvents } from './09_통계이력.js';
import { phaseEnvironment, phaseFire } from './13_환경과화재.js';
import { phaseHerds } from './14_초식.js';
import { phasePredation } from './15_포식.js';

export const DAY_PHASES=[
  ['환경',phaseEnvironment], ['화재',phaseFire], ['대형 초식',phaseHerds],
  ['포식',phasePredation], ['기록',phaseBookkeeping],
];
export function stepDay(w){ for(const [,fn] of DAY_PHASES) fn(w); }

export function phaseBookkeeping(w){
  w.day++;
  if(w.day%5===0){ computeWaterDist(w); refreshSpeciesCounts(w); }
  if(++w.sampleTick>=w.sampleEvery){ w.sampleTick=0; recordSample(w); }
  if(w.day>=365) closeYear(w);
  watchEvents(w);
}
