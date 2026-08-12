/* 섬 생태 시뮬레이터 — 사양 상수 (문서에서 그대로 옮긴 데이터)
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

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
  S :{ name:'S',  areaKm2:10,   cellM:100, habitableFrac:0.85, maxElevM:300,  dwarf:true,  instBudget:1200 },
  M :{ name:'M',  areaKm2:50,   cellM:100, habitableFrac:0.85, maxElevM:700,  dwarf:false, instBudget:3000 },
  L :{ name:'L',  areaKm2:200,  cellM:200, habitableFrac:0.82, maxElevM:1400, dwarf:false, instBudget:5000 },
  XL:{ name:'XL', areaKm2:1000, cellM:400, habitableFrac:0.78, maxElevM:2500, dwarf:false, instBudget:8000 },
};
export const ECO = { sustainableOfftake:0.10, dailyIntakeFrac:0.03, predatorBiomassFrac:0.005,
              splitT4:0.40, splitT5:0.60,
              bodyMassT2Kg:2, bodyMassT4Kg:8, bodyMassT5Kg:40,
              mvpShort:50, mvpLong:500, dwarfFactor:0.6,
              richnessBase:60, richnessExp:0.30 };

/* 이름은 표시용이며 로직이 절대 참조하지 않는다 [C-5.1].
   같은 세계라도 시드에 따라 다른 종이 뽑힌다. */
export const NAME_POOL = {
  SAVANNA:{
    T0:['짧은풀','키큰풀','붉은수염풀','별풀','덤불풀','가시덤불','우산아카시아','바오밥','관목떨기','억새','물가사초','마른대숲','가시나무','뿔풀'],
    T1:['흰개미','쇠똥구리','메뚜기','수확개미','들벌','지렁이','파리떼','나무이'],
    T2:['들쥐','바위너구리','땅다람쥐','뜀토끼','호로새','자고새','땃쥐','줄무늬몽구스','뿔도마뱀','모래쥐','비단털쥐','굴파는쥐','풀뱀','메추라기'],
    T3:['톰슨가젤','임팔라','줄무늬말','누','일런드','오릭스','혹멧돼지','물영양','뿔소','기린영양','산양','큰뿔사슴'],
    T4:['검은등자칼','서벌','카라칼','줄무늬살쾡이','사막여우'],
    T5:['갈기사자','점박이하이에나','치타','들개무리'] },
  TEMPERATE:{
    T0:['새포아풀','참억새','산딸기덤불','싸리나무','참나무','소나무','자작나무','단풍나무','고사리','이끼','칡','물푸레','서어나무','노간주','조릿대','산초나무','다래','으름','벚나무','밤나무','상수리','개암','노루발','둥굴레'],
    T1:['꿀벌','개미','지렁이','풍뎅이','나비','거미','노래기','딱정벌레','반딧불이'],
    T2:['멧토끼','청설모','들쥐','다람쥐','두더지','꿩','멧비둘기','산개구리','도마뱀','땃쥐','하늘다람쥐','메추라기','물쥐'],
    T3:['노루','고라니','멧돼지','붉은사슴','산양','들소','말사슴','큰뿔양'],
    T4:['붉은여우','삵','담비','오소리'],
    T5:['회색늑대','불곰'] },
  TROPICAL:{
    T0:['이엽나무','무화과','야자','덩굴','착생란','대나무','고무나무','판근나무','바나나','생강','토란','칡덩굴','이끼','양치','부겐빌레아','망고','카카오','판다누스','맹그로브','헬리코니아','라탄','후추덩굴','종려','열대사초','거목','부착란','수관덩굴','고사리나무','왕대','물봉선','수련','부들','열대풀','벌레잡이풀','파초','히비스커스','란타나','아라리아','수관이끼','겨우살이','기생란'],
    T1:['잎꾼개미','흰개미','장수풍뎅이','나비','벌','파리','지네','거미','노래기','달팽이','딱정벌레','매미','귀뚜라미','바퀴','진드기','말벌','꿀벌','개미핥기벌레'],
    T2:['다람쥐원숭이','과일박쥐','나무쥐','아구티','파카','앵무','큰부리새','청설모','나무타기쥐','도마뱀','청개구리','비단뱀새끼','땃쥐','바구니쥐','나무두더지','열대꿩','비둘기','나무개구리'],
    T3:['맥','페커리','작은사슴','물사슴','들소','고릴라','오랑우탄'],
    T4:['오셀롯','마게이','코아티','족제비','사향고양이'],
    T5:['재규어','표범'] },
};
