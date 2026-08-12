/* 섬 생태 시뮬레이터 — 튜닝 상수 (구현이 정한 값. 문서에 근거가 없다)
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

/* 밸런스를 만질 곳은 오직 여기다. 각 값의 근거는 31_ [S-8] 에 있다. */

export const TUNE = {
  coastLow:0.85, coastAmp:0.30, boxFactor:2.4,
  massifSigmaCells:13.5, orographicLiftRefM:230, moistureRecoverPerSea:0.07,
  permanentWaterFrac:0.025, seasonalWaterFrac:0.080,
  fertBase:0.62, fertNoiseAmp:0.30, fertWaterBonus:0.16,
  soilCapMm:130, etBaseMm:0.55, etPerDegC:0.09,
  wiltMm:12, fieldSpanMm:58, seasonalWaterMinSoilMm:34,
  grassShareOfStanding:0.10, woodyGrowthPerYr:0.30, tempSigma:320,
  /* 목본이 초지 부양력을 깎는 강도. 0.85로 두면 수관 50%에서 초지 용량이
     반토막 나고, 방목이 그걸 연료 하한 아래로 끌어내려 화재가 영구히 죽는다.
     실제 사바나는 수관 50%에서도 상당한 초지를 유지한다. */
  woodySuppression:0.55,
  fireSeasonStart:0.35, ignitionsPerKm2Yr:0.010,
  /* 확산 확률을 상수로 두면 퍼콜레이션 절벽에 걸린다.
     0.22에서 84%가 타고 0.18에서 1%가 탄다 — 그 사이에 17~33%가 없다.
     실제 불을 멈추는 것은 확률이 아니라 연료의 불균질성이므로,
     확산 확률이 연료량에 연속적으로 비례하게 만든다. */
  /* 확산 확률을 상수로 두면 퍼콜레이션 절벽에 걸린다(0.22에서 84%, 0.18에서 1%).
     불을 멈추는 것은 확률이 아니라 연료의 불균질성이므로,
     확산 확률이 연료량에 연속적으로 비례하게 만들어 절벽을 없앤다. */
  fireSpreadP:0.310, fireWindBias:0.55,
  /* 화재 수명. 연료가 97% 셀에서 연속이면 방화선이 없어 불이 건기 내내
     연쇄해 섬 전체를 태운다. 실제 사바나 화재는 며칠이면 소진된다.
     불이 번질 수 있는 날 수를 제한하는 것이 탄 면적을 정하는 실질 손잡이다. */
  fireMaxAgeDays:999,
  fireDrynessMin:0.40, fireFuelMinTonPerHa:0.75, fireFuelRefTonPerHa:1.45,   // 확정: 화재 19%/년 · 목본 32%
  fireBurnDays:2,
  fireGrassSurvive:0.11, fireWoodySurvive:0.80, fireAshFert:0.028, fireBigEventFrac:0.03,
  herdSeedSize:45, herdSplitAt:92, herdMergeBelow:30, herdMinSize:4,
  hydrationDays:6, drinkRadiusCells:1, waterGradientCells:60,
  moveGrazeKmDay:0.12, moveThirstKmDay:1.44,
  energyGainRate:0.12, satietyBreakEven:0.85,
  dehydrationPenalty:0.040, dehydrationOnset:0.20,
  birthRate:0.0020, birthEnergyMin:0.35, birthEnergySpan:0.40,
  deathRate:0.0060, deathEnergyMax:0.35,
  utilFeed:1.0, utilThirst:4.4, utilFear:1.5, utilCrowd:0.00004, utilNoise:0.16,
  t2GrowthPerYr:2.6, t2UpdateEvery:5,      // T2 종별 갱신을 5일 주기로 엇갈리게 돌린다
  predMoveKmDay:{apex:0.72, small:0.48},
  predKillSurplus:1.8,        // 처리시간 한계 (홀링 II형의 포화 상한)
  predAttackRate:0.0065,      // 탐색 효율. 국소 먹이 500kg에서 절반 포화
  predTakePerHerd:0.02,
  predAltPreyShare:{apex:0.45, small:1.0},
  predEnergyRate:0.03, predSatietyBreakEven:0.85,
  predBreedP:0.0016, predBreedEnergy:0.72, predDeathEnergy:0.05,
  predTerritoryK:0.06, intraguildP:0.0040, alleeFloor:0.15,
  predOffDietEff:0.40,        // 선호 먹이가 아닌 종을 잡을 때의 효율
  fearGain:{apex:0.16, small:0.05}, fearDecay:0.93,
  immigrationPerYear:0.025, immigrationFounders:6, immigrationBelowFrac:0.25,
  /* 종 */
  rankAbundanceRatio:0.75,   // 순위-풍부도 기하급수 공비. 소수 우점 + 다수 희소
  /* 종 수 상한. [I-6.4] 종-면적 곡선은 XL 사바나에 48종을 요구하지만,
     그만큼 쪼개면 등급 예산이 잘게 나뉘어 종마다 최소존속선 근처가 되고
     식생 동역학이 발산하거나 0으로 수렴한다. 시뮬 대상은 10종 이내로 묶고
     나머지는 로스터에 집계로만 남긴다(표현과 검증에는 계획 종 수를 쓴다). */
  speciesMax:{T0:2,T1:1,T2:2,T3:3,T4:1,T5:1},   // 합 10
  simGrassMax:1, simWoodyMax:1,   // 셀 단위로 시뮬하는 식물 종 수 (기능군별로 따로 뽑는다.
                              // 전체 몫 순으로 뽑으면 상위가 전부 초본이라 목본이 통째로 빠진다)
  dietWidthMin:2,            // [C-5.2] 대체재 강제
  woodyBrowseFrac:0.06,      // 목본 중 실제로 뜯어먹을 수 있는 몫(잎·어린가지).
                             // 이걸 두지 않으면 목본 전체가 먹이가 되어
                             // 초식이 영원히 배부르고 굶주림이 작동하지 않는다.
  massSpreadLog:0.55,        // 등급 평균 체중 주변의 로그 분산
  lifespanFromMass:{a:11.5, b:0.20},  // 수명(년) = a * 체중^b (알로메트리)
  /* 개체 추적 [I-9.3][I-9.4] */
  trackSampleDays:20, trackMaxPoints:90, eventMax:36,
  deadRegistryMax:400,       // 사망 명부 상한. 넘치면 오래된 것부터 버린다
};
