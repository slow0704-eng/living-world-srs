/* 섬 생태 시뮬레이터 — 사양 상수 (문서에서 그대로 옮긴 데이터)
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다. */

/* 30_ <표 C-1> · 29_ <표 I-1>. [C-5.1] 이름은 표시용이며 로직이 참조하지 않는다.
   여기를 고치면 문서도 같이 고쳐야 한다. */

export const CLIMATE_PROFILES = {
  SAVANNA:{ name:'사바나',
    tempMeanC:24, tempAnnualRangeC:6,  tempOptC:25,
    rainAnnualMm:700,  wetSeasonMonths:6,  runoffCoef:0.15,
    nppTonPerKm2Yr:800,  standingTonPerHa:40, browseAvailability:0.45,
    splitT2:0.25, splitT3:0.75, bodyMassT3Kg:80,
    richnessFactor:0.8, fireEnabled:true, droughtToleranceMin:0.7, grassSpeciesFrac:0.60,
    mix:{T0:.30,T1:.15,T2:.25,T3:.20,T4:.07,T5:.03} },
  TEMPERATE:{ name:'온대',
    tempMeanC:12, tempAnnualRangeC:24, tempOptC:18,
    rainAnnualMm:1000, wetSeasonMonths:8,  runoffCoef:0.30,
    nppTonPerKm2Yr:1200, standingTonPerHa:250, browseAvailability:0.20,
    splitT2:0.40, splitT3:0.60, bodyMassT3Kg:60,
    richnessFactor:1.0, fireEnabled:true, droughtToleranceMin:0.3, grassSpeciesFrac:0.35,
    mix:{T0:.40,T1:.15,T2:.22,T3:.13,T4:.07,T5:.03} },
  TROPICAL:{ name:'열대',
    tempMeanC:26, tempAnnualRangeC:3,  tempOptC:27,
    rainAnnualMm:2500, wetSeasonMonths:10, runoffCoef:0.35,
    nppTonPerKm2Yr:2200, standingTonPerHa:400, browseAvailability:0.05,
    splitT2:0.60, splitT3:0.40, bodyMassT3Kg:40,
    richnessFactor:1.5, fireEnabled:false, droughtToleranceMin:0.1, grassSpeciesFrac:0.25,
    mix:{T0:.45,T1:.20,T2:.20,T3:.08,T4:.05,T5:.02} },
};
export const ISLAND_TIERS = {
  /* 면적은 10배씩 오른다 — 10 / 100 / 1,000 / 10,000 km².
     격자변은 셀 개수가 6,400 안팎에서 묶이도록 면적과 함께 키운다([I-2.1]).
     그래서 환경 틱 비용은 티어와 무관하게 거의 일정하고, 티어마다 달라지는
     것은 '한 셀이 몇 km인가'와 '개체가 몇 마리인가'다. */
  S :{ name:'S',  areaKm2:10,    cellM:100,  habitableFrac:0.85, maxElevM:300,  dwarf:true,  instBudget:1200 },
  M :{ name:'M',  areaKm2:100,   cellM:125,  habitableFrac:0.84, maxElevM:700,  dwarf:false, instBudget:3000 },
  L :{ name:'L',  areaKm2:1000,  cellM:400,  habitableFrac:0.78, maxElevM:2500, dwarf:false, instBudget:5000 },
  XL:{ name:'XL', areaKm2:10000, cellM:1250, habitableFrac:0.72, maxElevM:3500, dwarf:false, instBudget:8000 },
};
export const ECO = { sustainableOfftake:0.10, dailyIntakeFrac:0.03, predatorBiomassFrac:0.005,
              splitT4:0.40, splitT5:0.60,
              bodyMassT1Kg:0.002, detritusShare:0.55,   // T1 분해자 (문서 근거 없음 · [I-4] 형식만 따름)
              bodyMassT2Kg:2, bodyMassT4Kg:8, bodyMassT5Kg:40,
              mvpShort:50, mvpLong:500, dwarfFactor:0.6,
              richnessBase:60, richnessExp:0.30 };

/* 이름은 표시용이며 로직이 절대 참조하지 않는다 [C-5.1].
   같은 세계라도 시드에 따라 다른 종이 뽑힌다.

   누구나 아는 이름으로 적는다. '톰슨가젤 · 검은등자칼 · 오릭스'처럼 정확한
   이름을 쓰면 화면을 읽을 때마다 그게 무슨 짐승인지부터 떠올려야 한다.
   기후대는 지킨다 — 사바나에 곰을, 온대에 사자를 놓지는 않는다.
   같은 풀 안에 이름이 겹치면 안 된다(비복원 추출이라 두 종이 같은 이름을
   갖게 된다). 풀 크기는 그 등급의 계획 종 수보다 넉넉해야 한다. */
export const NAME_POOL = {
  SAVANNA:{
    /* 식물 이름은 기능군으로 갈라 둔다. 한 통에 섞어 두면 '마른풀'이 목본으로,
       '덤불나무'가 초본으로 뽑혀 화면이 거짓말을 한다 — 로직은 이름을 보지
       않지만([C-5.1]) 읽는 사람은 본다. */
    T0g:['짧은풀','키큰풀','억새','갈대','사초','마른풀','이끼'],
    T0w:['덤불','가시덤불','아카시아','바오밥','관목','가시나무','덤불나무'],
    T1:['흰개미','쇠똥구리','메뚜기','개미','벌','지렁이','파리','딱정벌레'],
    T2:['토끼','들쥐','다람쥐','두더지','도마뱀','뱀','메추라기','자고새',
        '몽구스','미어캣','땅다람쥐','뿔토끼','바위너구리','들다람쥐'],
    T3:['야생마','얼룩말','사슴','멧돼지','염소','영양','가젤','들소',
        '물소','기린','코뿔소','말'],
    T4:['자칼','여우','삵','오소리','하이에나'],
    /* 하이에나는 T4 로 옮겼다(요청). 같은 이름이 두 등급에 있으면
       한 세계에 하이에나가 둘 뜬다. */
    T5:['사자','표범','치타','들개'] },
  TEMPERATE:{
    T0g:['억새','고사리','이끼','갈대','토끼풀','민들레','쑥','칡'],
    T0w:['참나무','소나무','자작나무','단풍나무','산딸기','싸리','대나무','밤나무',
         '상수리','벚나무','진달래','개암','물푸레','버드나무','대추나무','밤덤불'],
    T1:['꿀벌','개미','지렁이','풍뎅이','나비','거미','노래기','딱정벌레','반딧불이'],
    T2:['토끼','다람쥐','들쥐','두더지','청설모','꿩','비둘기','개구리',
        '도마뱀','뱀','산토끼','물쥐','날다람쥐'],
    T3:['사슴','노루','멧돼지','염소','야생마','들소','고라니','산양'],
    T4:['여우','삵','담비','오소리'],
    T5:['늑대','곰','호랑이'] },
  TROPICAL:{
    T0g:['이끼','양치','난초','생강','토란','수련','부들','파초','열대풀','열대사초',
         '물봉선','벌레잡이풀','기생란','착생란','헬리코니아','수관이끼','고사리나무'],
    T0w:['무화과','야자','대나무','고무나무','바나나','망고','맹그로브','종려','거목',
         '왕대','히비스커스','카카오','판다누스','란타나','부겐빌레아','아라리아',
         '판근나무','라탄','덩굴','칡덩굴','후추덩굴','수관덩굴','겨우살이'],
    T1:['잎꾼개미','흰개미','장수풍뎅이','나비','벌','파리','지네','거미','노래기',
        '달팽이','딱정벌레','매미','귀뚜라미','바퀴','진드기','말벌','꿀벌','개미핥기벌레'],
    T2:['원숭이','박쥐','나무쥐','다람쥐','앵무','큰부리새','도마뱀','개구리',
        '뱀','토끼','두더지','청설모','들쥐','비둘기','꿩','거북','나무개구리','날다람쥐'],
    T3:['멧돼지','사슴','물소','맥','고릴라','오랑우탄','코끼리'],
    T4:['살쾡이','족제비','사향고양이','너구리','삵'],
    T5:['호랑이','표범','재규어'] },
};
