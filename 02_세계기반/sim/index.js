/* 섬 생태 시뮬레이터 — 시뮬레이션 코어 진입점 (검증 스크립트가 여기서 가져간다)
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

export { CLIMATE_PROFILES, ISLAND_TIERS, ECO, NAME_POOL } from './01_사양상수.js';
export { TUNE } from './02_튜닝상수.js';
export * from './03_유틸.js';
export { deriveCapacity, viability } from './04_유도.js';
export { buildRoster } from './05_종.js';
export { newInd, addEv, killInd, noteKill, indAge } from './06_개체.js';
export { HALL_CATS, hallOfFame, indBrief, indexByUid } from './10_기록.js';
export { buildReport, traceDeaths } from './11_분석서.js';
export { SPEC_EVENTS, trackSpecies, speciesTrail } from './12_종발자취.js';
export { createWorld, computeWaterDist } from './07_세계생성.js';
export { stepDay, DAY_PHASES, newAnimal, attachInd } from './08_하루.js';
export { collectStats, refreshSpeciesCounts, tierCount, aliveSpecies,
         recordSample, closeYear, watchEvents, logChron,
         chronDirty, setChronDirty } from './09_통계이력.js';
