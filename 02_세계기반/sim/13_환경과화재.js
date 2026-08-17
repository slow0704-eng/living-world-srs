/* 섬 생태 시뮬레이터 — [S-4] 하루 1·2위상 — 계절 · 환경 · 화재
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다. */

/* 이 두 위상은 셀 격자만 만진다. 개체를 모르고, 개체도 이 결과를 셀에서만 읽는다.
   그래서 비용이 개체 수가 아니라 셀 수에 매인다 — XL 프로파일에서 하루의 0.2%다.
   계절(seasonOf)이 여기 있는 것은 강수 · 기온 · 건조도가 전부 여기서 소비되기
   때문이다. 초식은 번식기 판정에만 이 값을 빌려 간다. */

import { ECO } from './01_사양상수.js';
import { TUNE } from './02_튜닝상수.js';
import { clamp } from './03_유틸.js';

export function seasonOf(w){
  const wet=w.day<w.wetDays;
  const tempC=w.C.tempMeanC+w.C.tempAnnualRangeC/2*Math.cos((w.day-20)/365*Math.PI*2);
  const shape=wet?Math.sin(w.day/w.wetDays*Math.PI)**1.4:0;
  const rainMm=w.C.rainAnnualMm/(w.wetDays*0.61)*shape*(w.dry?0.6:1);
  return {wet,tempC,rainMm,dryProgress:wet?0:(w.day-w.wetDays)/Math.max(365-w.wetDays,1)};
}

export function phaseEnvironment(w){
  const {g,land,elev,soil,fert,fear,burn,fire,rainMul,wdist,C,plantB,plantCap,
         t2d,t1d,grass,woody,pm,tm,t1m}=w;
  const s=seasonOf(w), N=g.N, nP=pm.n, nT2=tm.n, nT1=t1m.n;
  const K=TUNE.t2UpdateEvery, K1=TUNE.t1UpdateEvery;
  const nppDay=C.nppTonPerKm2Yr*w.cellKm2/365;
  const day=w.day, invWoodyCap=1/w.woodyCap;
  let sumSoil=0,burning=0,prod=0,sumG=0,sumW=0,capG=0;
  /* 셀 한 번 훑기 안에서 물 · 식물 · T2를 모두 처리한다.
     종을 나눈 뒤 패스를 여러 번 돌면 비용이 종 수만큼 곱해진다. */
  for(let i=0;i<N;i++){
    if(!land[i]) continue;
    const et=TUNE.etBaseMm+TUNE.etPerDegC*Math.max(0,s.tempC-elev[i]/154-14);
    const sw=clamp(soil[i]+s.rainMm*rainMul[i]*(1-C.runoffCoef)-et,0,TUNE.soilCapMm);
    soil[i]=sw; sumSoil+=sw;
    if(burn[i]>=0) burn[i]++;
    if(fire[i]) burning++;
    fear[i]*=TUNE.fearDecay;

    /* 초지 부양력은 '그 셀의' 목본에 눌린다. 섬 전체 평균을 쓰면 섬이 균질해져
       방화선이 사라지고 화재가 전부 아니면 전무가 된다(퍼콜레이션). */
    const grassMul=1-TUNE.woodySuppression*clamp(woody[i]*invWoodyCap,0,1);
    const fWraw=clamp((sw-TUNE.wiltMm)/TUNE.fieldSpanMm,0,1);
    /* 그 칸의 기온. 고도가 오르면 내려간다(-6.5℃/km). 최적 기온은 종마다
       다르므로 fT 는 종 루프 안에서 잰다 — 그래야 높은 곳과 낮은 곳의
       우세종이 갈린다. */
    const tCell=s.tempC-elev[i]*0.0065;
    const fe=fert[i];
    let gi=0, wi=0;
    for(let k=0;k<nP;k++){
      const o=k*N+i;
      /* 기온은 성장 속도가 아니라 '천장'을 정한다. 속도에만 걸면 몫이 큰 종이
         어디서나 이겨 우세종이 지형을 타지 않는다 — 실제로 그랬다.
         천장에 걸어야 고도가 오를수록 서늘한 쪽이 자리를 넘겨받는다. */
      const fT=Math.exp(-((tCell-pm.tempOpt[k])**2)/TUNE.tempSigma);
      let capC=plantCap[o]*fT;
      if(!pm.woody[k]) capC*=grassMul;
      if(capC>0){
        // 내건성은 종을 '가르는' 값이지 모두를 살찌우는 값이 아니다.
        // 가산 보정을 쓰면 섬 전체 성장이 부풀어 연료와 목본이 함께 폭주한다.
        // 기후 최저 내건성을 기준으로 0.7~1.3 배율이 되도록 중립화한다(buildSpeciesMeta).
        const fW=clamp(fWraw*pm.drought[k],0,1);
        if(fW>0.02){
          const b=plantB[o];
          // 목본 성장도 토양수분에 제한된다. 이 fW를 빠뜨리면 목본이 2~3배 빨리
          // 자라 화재와의 경주에서 이겨버리고, 초지가 관목림으로 굳는다.
          const rate=pm.woody[k]? TUNE.woodyGrowthPerYr/365*b*(1-b/capC)*fW*fT
                                : nppDay*pm.share[k]*fW*fT*fe*(1-b/capC);
          if(rate>0){ plantB[o]=b+rate; if(!pm.woody[k]) prod+=rate; }
        }
        if(plantB[o]>capC) plantB[o]=capC;
      }
      if(pm.woody[k]) wi+=plantB[o]; else { gi+=plantB[o]; capG+=capC; }
    }
    grass[i]=gi; woody[i]=wi; sumG+=gi; sumW+=wi;

    /* ── T1 분해자 : 종별 x 셀 밀도장 ─────────────────────────────────
       밥은 '그 칸에 떨어지는 낙엽'이고, 종마다 주로 먹는 낙엽이 다르다.
       그래서 T0 우세종이 바뀌면 T1 우세종이 따라 바뀐다 — 지형이 식물을
       가르고, 식물이 분해자를 가르고, 분해자가 소형 육식을 옮긴다.
       분해 자체는 따뜻하고 젖어야 일어나므로 두 항이 더 곱해진다. */
    const fDecT=clamp((tCell-TUNE.t1TempMinC)/TUNE.t1TempSpanC,0,1);
    for(let k=0;k<nT1;k++){
      if((day+k)%K1!==0||!t1m.on[k]) continue;
      const o=k*N+i, v=t1d[o];
      if(v<=0) continue;
      /* 습기는 최적점 둘레의 종형 반응이다. 배율로 곱하면 젖은 칸에서
         둘 다 상한에 붙어 종 차이가 지워진다. */
      const dw=(sw-t1m.soilOpt[k])/TUNE.t1SoilTolMm;
      const fDecW=Math.exp(-dw*dw);
      /* 낙엽 = 현존량 x 회전율. 순생산이 아니다 — 천장에 붙은 우세종은
         성장이 멎어 순생산이 0 이지만 낙엽은 가장 많이 떨어뜨린다. */
      let litter=0; const dl=t1m.diet[k], ml=t1m.mul[k];
      for(let m=0;m<dl.length;m++) litter+=plantB[dl[m]*N+i]*ml[m];
      const cap1=Math.max(litter*TUNE.t1LitterTurnover*ECO.detritusShare*t1m.share[k]
                          /t1m.intake[k]*fDecT*fDecW,0.2);
      /* 리커식으로 따라간다. 덧셈형 로지스틱은 부양력이 갑자기 내려앉으면
         (1 - v/cap)이 큰 음수가 되어 개체수가 음의 무한대로 튄다 —
         전역 수치 시절에 실제로 튀었고, 셀로 쪼개면 마른 칸마다 튄다. */
      const nv=Math.min(v*Math.exp(t1m.rate[k]*(1-v/cap1)),cap1*3);
      t1d[o]=nv<0.001?0:nv;
    }

    /* 물 접근성. T2 는 밀도장이라 옮겨갈 수 없으므로 물을 '죽음'이 아니라
       '부양력'으로 건다 — 수원에서 먼 칸은 애초에 적게 산다. 건기에 수원이
       마르면 wdist 가 늘어 이 값이 함께 내려간다. */
    const wAcc=1-(1-TUNE.t2DryFloor)*clamp(wdist[i]/w.t2WaterRange,0,1);
    for(let k=0;k<nT2;k++){
      if((day+k)%K!==0||!tm.on[k]) continue;
      const o=k*N+i, v=t2d[o];
      if(v<=0) continue;
      let food=0; const dl=tm.diet[k], ml=tm.mul[k];
      for(let m=0;m<dl.length;m++) food+=plantB[dl[m]*N+i]*ml[m];
      // [I-4]와 같은 방식: 가식 먹이 x 종 몫 x 지속채식률 / 개체당 연간 섭취량
      const cap=Math.max(food*tm.share[k]*ECO.sustainableOfftake/tm.intake[k]*wAcc,0.2);
      const nv=v+v*tm.rate[k]*(1-v/cap);
      t2d[o]=nv<0.001?0:nv;
    }
  }
  /* T1 분해자 : 개체가 아니라 하나의 수치다. 그 해 순생산에 부양력이 매이고
     로지스틱으로 따라간다 — 초지가 타거나 마르면 분해자도 함께 줄어든다.
     곤충이라 회전이 빨라 성장률이 크다. */
  /* 분해자 합계. 이제 종별 밀도장이므로 세어서 담는다(계기와 표본이 읽는다). */
  {
    w.n1=0;
    for(let k=0;k<nT1;k++){
      if(!t1m.on[k]) continue;
      const o=k*N; let sum=0;
      for(let j=0;j<N;j++) sum+=t1d[o+j];
      w.species[w.byTier.T1[k]].n=sum; w.n1+=sum;
    }
  }
  Object.assign(w.env,{tempC:s.tempC,rainMm:s.rainMm,soilMm:sumSoil/w.landCount,
    grassT:sumG,woodyT:sumW,woodyFrac:sumW/(w.landCount*w.woodyCap),
    /* 초본이 '지금 자랄 수 있는 최대'까지 얼마나 찼는가.
       현존량만 보면 부양력이 목본에 눌려 줄어든 것인지, 뜯기고 탄 것인지
       구분할 수 없다. T3가 왜 주는지는 이 둘을 나눠 봐야 나온다. */
    grassCapT:capG, grassFill:capG>0?sumG/capG:0,
    burning,wet:s.wet,dryProgress:s.dryProgress,
    prodEMA:w.env.prodEMA?w.env.prodEMA*0.996+prod*365*0.004:prod*365});
}

export function phaseFire(w){
  const {g,land,soil,water,fert,burn,fire,fireAge,plantB}=w, rng=w.rng, N=g.N;
  if(w.supp||!w.C.fireEnabled){ if(w.env.burning) fire.fill(0); return; }
  const s=seasonOf(w);
  const inSeason=!s.wet&&s.dryProgress>=TUNE.fireSeasonStart;
  const fuelMin=TUNE.fireFuelMinTonPerHa*w.cellHa;
  const fuelRef=TUNE.fireFuelRefTonPerHa*w.cellHa;
  const nf=new Uint8Array(N), nfAge=new Uint8Array(N);
  const pIg=TUNE.ignitionsPerKm2Yr*w.cellKm2/365/Math.max(1-TUNE.fireSeasonStart,0.01)
           *(365/Math.max(365-w.wetDays,1));
  for(let i=0;i<N;i++){
    if(!land[i]) continue;
    const dry=1-clamp(soil[i]/70,0,1);
    if(fire[i]){
      if(fireAge[i]>=w.fireMaxAge) continue;          // 갈 데까지 간 불은 더 번지지 않는다
      const x=g.xOf(i),y=g.yOf(i);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!g.inside(x+dx,y+dy)) continue;
        const j=g.idx(x+dx,y+dy);
        if(!land[j]||fire[j]||nf[j]||water[j]===2||w.grass[j]<=fuelMin) continue;
        const jd=1-clamp(soil[j]/70,0,1);
        if(jd<TUNE.fireDrynessMin) continue;
        const wind=dx<0?1+TUNE.fireWindBias:dx>0?1-TUNE.fireWindBias:1;
        const fuel=clamp((w.grass[j]-fuelMin)/(fuelRef-fuelMin),0,1);
        if(rng()<TUNE.fireSpreadP*jd*wind*fuel){ nf[j]=1; nfAge[j]=fireAge[i]+1; }
      }
    } else if(inSeason&&dry>0.55&&w.grass[i]>fuelMin&&rng()<pIg*dry){ nf[i]=1; nfAge[i]=0; w.acc.fireCount++; }
  }
  const pm=w.pm;
  for(let i=0;i<N;i++){
    if(fire[i]&&--fire[i]===0){
      let gi=0,wi=0;
      for(let k=0;k<pm.n;k++){
        const o=k*N+i;
        plantB[o]*= pm.woody[k]?TUNE.fireWoodySurvive:TUNE.fireGrassSurvive;
        if(pm.woody[k]) wi+=plantB[o]; else gi+=plantB[o];
      }
      w.grass[i]=gi; w.woody[i]=wi;
      fert[i]=Math.min(1,fert[i]+TUNE.fireAshFert);
      burn[i]=0; w.acc.burnedYr++;
    }
    if(nf[i]){ fire[i]=TUNE.fireBurnDays; fireAge[i]=nfAge[i]; }
  }
}

/* ── 대형 초식 : 개체 ────────────────────────────────────────────────
   최소 단위는 개체다. 무리는 객체가 아니라 결과다 — 같은 종끼리 모이려는
   성향과 과밀을 피하려는 성향이 맞물려 뭉치는 것뿐이다 [S-4.1].

   개체 수만 마리를 매일 9칸씩 훑게 하면 하루가 감당이 안 되므로 두 가지를 쓴다.
     1) 셀 효용 필드 : 이동 효용에서 개체와 무관한 부분(먹이 · 공포 · 혼잡 ·
        동종 밀도)을 종마다 하루 한 번 셀 단위로 미리 깐다.
     2) 결정 주기    : 방향은 decideEvery 일마다 다시 고르고 그 사이는 관성으로
        간다. 개체마다 위상을 엇갈려 같은 날 몰리지 않게 한다.
   덕분에 개체 하나의 하루는 '9칸 조회 + 산술 몇 줄'이 된다. */
