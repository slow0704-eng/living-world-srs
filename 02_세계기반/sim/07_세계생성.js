/* 섬 생태 시뮬레이터 — [S-3] 결정론적 세계 생성
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

import { CLIMATE_PROFILES, ISLAND_TIERS, ECO } from './01_사양상수.js';
import { TUNE } from './02_튜닝상수.js';
import { clamp, mulberry32, makeNoise, fbm, makeGrid } from './03_유틸.js';
import { deriveCapacity } from './04_유도.js';
import { buildRoster } from './05_종.js';
import { newInd } from './06_개체.js';
import { newAnimal } from './08_하루.js';
import { refreshSpeciesCounts, recordSample, logChron } from './09_통계이력.js';

export function createWorld(seed, tierKey='XL', climateKey='SAVANNA'){
  const T=ISLAND_TIERS[tierKey], C=CLIMATE_PROFILES[climateKey];
  const cap=deriveCapacity(tierKey,climateKey);
  const cellKm=T.cellM/1000, cellKm2=cellKm**2, cellHa=cellKm2*100;
  const targetLand=Math.round(T.areaKm2/cellKm2);
  const box=Math.ceil(Math.sqrt(targetLand/Math.PI)*TUNE.boxFactor/2)*2;
  const g=makeGrid(box,box), N=g.N;
  const rand=mulberry32(seed), noise=makeNoise(mulberry32(seed^0x9E3779B9));
  const R=buildRoster(tierKey,climateKey,cap,mulberry32(seed^0x1B873593));

  const w={ seed, tierKey, climateKey, T, C, cap, g, cellKm, cellKm2, cellHa, targetLand,
    species:R.species, byTier:R.byTier, simPlants:R.simPlants, totalPlanned:R.totalPlanned,
    land:new Uint8Array(N), elev:new Float32Array(N), fert:new Float32Array(N),
    rainMul:new Float32Array(N), gcap:new Float32Array(N), soil:new Float32Array(N),
    water:new Uint8Array(N), wdist:new Float32Array(N), fear:new Float32Array(N),
    burn:new Int16Array(N), fire:new Uint8Array(N), fireAge:new Uint8Array(N),
    press:new Float32Array(N),
    dens4:new Float32Array(N), dens5:new Float32Array(N),
    plantB:null, plantCap:null, t2d:null,          // 종별 x 셀 (아래에서 할당)
    grass:new Float32Array(N), woody:new Float32Array(N),   // 기능군 합계(표현·화재용)
    /* 대형 초식은 개체다. aniAt 은 셀 -> 그 셀의 개체들(포식이 쓴다),
       dens 는 종별 셀 밀도(모이려는 성향이 읽는다), util 은 종별 이동 효용 필드다. */
    /* 셀 버킷은 두 벌을 번갈아 쓴다(오늘 채우는 동안 어제 것을 읽어야 한다).
       배열을 매일 새로 만들면 그 쓰레기 치우는 값이 시뮬레이션보다 비싸다. */
    ani:[], aniA:new Array(N), aniB:new Array(N), cellsA:[], cellsB:[],
    aniAt:null, aniCells:null, aniNext:null, nextCells:null,
    aniKilled:false, trackedAlive:0,
    t3Cnt:null, t3Sat:null,
    dens:null, densPrev:null, util:null, wpull:new Float32Array(N),
    flowX:new Int8Array(N), flowY:new Int8Array(N),   // 셀마다 물로 가는 방향
    p4:[], p5:[],
    rng:mulberry32(seed^0x51ED270B), uid:1,
    inds:[], dead:[],                              // 추적 개체 · 사망 명부
    day:0, year:0, landCount:0, nearCells:0, waterCells:0,
    wetDays:Math.round(365*C.wetSeasonMonths/12),
    grassCapBase:C.standingTonPerHa*TUNE.grassShareOfStanding*cellHa,
    woodyCap:C.standingTonPerHa*(1-TUNE.grassShareOfStanding)*cellHa,
    supp:false, noPred:false, dry:false, noImmig:true,
    acc:{bYr:0,dYr:0,killYr:0,burnedYr:0,fireCount:0},
    last:{births:0,deaths:0,kills:0,burnFrac:0,fires:0},
    totals:{births:0,deaths:0,kills:0,burned:0,fires:0,extinct:0},
    env:{tempC:C.tempMeanC,rainMm:0,soilMm:0,grassT:0,woodyT:0,woodyFrac:0,burning:0,wet:true,prodEMA:0,satiety:1},
    samples:[], sampleEvery:10, sampleTick:0, years:[], chron:[], peaks:{}, flags:{},
  };
  const nP=w.simPlants.length, nT2=w.byTier.T2.length;
  w.plantB=new Float32Array(nP*N); w.plantCap=new Float32Array(nP*N); w.t2d=new Float32Array(nT2*N);
  w.plantIdx=new Map(w.simPlants.map((id,k)=>[id,k]));
  w.t2Idx=new Map(w.byTier.T2.map((id,k)=>[id,k]));
  w.t3Idx=new Map(w.byTier.T3.map((id,k)=>[id,k]));
  const nT3=Math.max(1,w.byTier.T3.length);
  w.dens=new Float32Array(nT3*N); w.densPrev=new Float32Array(nT3*N);
  w.util=new Float32Array(nT3*N);
  w.t3Cnt=new Int32Array(nT3); w.t3Sat=new Float32Array(nT3);
  w.aniAt=w.aniA; w.aniCells=w.cellsA; w.aniNext=w.aniB; w.nextCells=w.cellsB;

  buildSpeciesMeta(w);
  genCoastline(w,noise); genElevation(w,noise); genRainfall(w);
  genHydrology(w); genSoil(w,noise,rand);
  buildDietMeta(w);
  computeWaterDist(w); seedFauna(w,mulberry32(seed^0x2545F491));
  syncPools(w); refreshSpeciesCounts(w); recordSample(w);
  const alive=w.species.filter(s=>s.status!=='ABSENT'&&s.kind==='ANIMAL'&&!s.aggregate).length;
  logChron(w,'act',`섬 생성 · ${T.name} ${T.areaKm2.toLocaleString('ko-KR')}km² · ${C.name} · 육지 ${w.landCount.toLocaleString('ko-KR')}셀 · 동물 ${alive}종`);
  const absent=w.species.filter(s=>s.status==='ABSENT');
  if(absent.length) logChron(w,'loss',`${absent.length}종이 부양력 미달로 결번 — ${absent.slice(0,3).map(s=>s.name).join(' · ')}${absent.length>3?' 외':''}`);
  return w;
}

/* 핫 루프가 객체 속성을 매번 들추지 않도록 종 특성을 형식화 배열로 펼친다 */
export function buildSpeciesMeta(w){
  const P=w.simPlants, T2=w.byTier.T2;
  w.pm={ n:P.length, woody:P.map(id=>w.species[id].woody),
         share:Float64Array.from(P,id=>w.species[id].simShare),
         drought:Float64Array.from(P,id=>{
           const dmin=w.C.droughtToleranceMin;
           return 0.7+0.6*(w.species[id].droughtTol-dmin)/Math.max(1-dmin,1e-6);
         }) };
  w.tm={ n:T2.length, on:T2.map(id=>w.species[id].status!=='ABSENT'),
         share:Float64Array.from(T2,id=>w.species[id].share),
         mass:Float64Array.from(T2,id=>Math.max(w.species[id].massKg,0.1)),
         rate:Float64Array.from(T2,id=>TUNE.t2GrowthPerYr/365*TUNE.t2UpdateEvery),
         // 개체당 연간 섭취량(t). 부양력을 [I-4]와 같은 방식으로 계산하기 위함이다.
         intake:Float64Array.from(T2,id=>Math.max(w.species[id].massKg,0.1)*ECO.dailyIntakeFrac*365/1000),
         diet:T2.map(id=>w.species[id].diet.map(d=>w.plantIdx.get(d)).filter(v=>v!==undefined)),
         // 먹이 종별 가식 배율. 목본은 잎·어린가지만 먹을 수 있다.
         // 이걸 빠뜨리면 목본(식물 총량의 90%)이 통째로 먹이가 되어
         // T2 부양력이 10배 부풀고 개체수가 유도값의 12배까지 간다.
         mul:T2.map(id=>w.species[id].diet
               .filter(d=>w.plantIdx.get(d)!==undefined)
               .map(d=>w.species[d].woody?TUNE.woodyBrowseFrac:1)) };
}

export function genCoastline(w,noise){
  const {g,land}=w, cx=g.W/2, cy=g.H/2, edge=new Float32Array(720);
  for(let a=0;a<720;a++){ const th=a/720*Math.PI*2;
    edge[a]=TUNE.coastLow+TUNE.coastAmp*fbm(noise,Math.cos(th)*2.1+40,Math.sin(th)*2.1+40,4); }
  const ang=(dx,dy)=>((Math.atan2(dy,dx)+Math.PI)/(Math.PI*2)*720|0)%720;
  const count=Rr=>{let c=0;
    for(let y=0;y<g.H;y++)for(let x=0;x<g.W;x++){const dx=x+.5-cx,dy=y+.5-cy;
      if(Math.hypot(dx,dy)<Rr*edge[ang(dx,dy)])c++;} return c;};
  let lo=2,hi=g.W,R=0;
  for(let i=0;i<34;i++){R=(lo+hi)/2; if(count(R)>w.targetLand)hi=R; else lo=R;}
  for(let y=0;y<g.H;y++)for(let x=0;x<g.W;x++){
    const dx=x+.5-cx,dy=y+.5-cy;
    if(Math.hypot(dx,dy)<R*edge[ang(dx,dy)]){ land[g.idx(x,y)]=1; w.landCount++; }
  }
}
export function genElevation(w,noise){
  const {g,land,elev}=w, N=g.N;
  const inland=new Float32Array(N).fill(-1), q=[];
  for(let i=0;i<N;i++) if(!land[i]){inland[i]=0;q.push(i);}
  for(let h=0;h<q.length;h++){
    const i=q[h],x=g.xOf(i),y=g.yOf(i);
    for(let d=0;d<4;d++){
      const nx=x+[1,-1,0,0][d], ny=y+[0,0,1,-1][d];
      if(!g.inside(nx,ny)) continue;
      const j=g.idx(nx,ny); if(inland[j]<0){inland[j]=inland[i]+1;q.push(j);}
    }
  }
  const s=TUNE.massifSigmaCells*(g.W/96), mx=g.W/2+s*0.55, my=g.H/2-s*0.41;
  const shore=Math.max(4,g.W/6); let emax=1e-6;
  for(let i=0;i<N;i++){
    if(!land[i]) continue;
    const x=g.xOf(i),y=g.yOf(i);
    const massif=Math.exp(-((x-mx)**2+(y-my)**2)/(2*s*s));
    const ridge =Math.exp(-((x-mx+s*0.8)**2/(2*(s*1.26)**2)+(y-my-s*0.96)**2/(2*(s*0.52)**2)));
    const e=(0.30*clamp(inland[i]/shore,0,1)+0.92*massif+0.34*ridge)
           *(0.45+0.85*fbm(noise,x*0.075*(96/g.W)+7,y*0.075*(96/g.W)+7,5));
    elev[i]=e; if(e>emax)emax=e;
  }
  for(let i=0;i<N;i++) if(land[i]) elev[i]=elev[i]/emax*w.T.maxElevM;
}
export function genRainfall(w){
  const {g,land,elev,rainMul}=w, liftRef=TUNE.orographicLiftRefM*(w.T.cellM/400);
  for(let y=0;y<g.H;y++){
    let M=1;
    for(let x=g.W-1;x>=0;x--){
      const i=g.idx(x,y);
      if(!land[i]){ M=Math.min(1,M+TUNE.moistureRecoverPerSea); rainMul[i]=0; continue; }
      const up=x<g.W-1?elev[g.idx(x+1,y)]:0;
      const lift=Math.max(0,(elev[i]-up)/liftRef);
      const r=Math.min(M*(0.24+1.25*lift), M*0.92);
      rainMul[i]=r; M=Math.max(0.035,M-r*0.88);
    }
  }
  let s=0; for(let i=0;i<g.N;i++) if(land[i]) s+=rainMul[i];
  const mean=s/w.landCount;
  for(let i=0;i<g.N;i++) if(land[i]) rainMul[i]=clamp(rainMul[i]/mean,0.28,2.3);
}
export function genHydrology(w){
  const {g,land,elev,rainMul,water}=w;
  const order=[]; for(let i=0;i<g.N;i++) if(land[i]) order.push(i);
  order.sort((a,b)=>elev[b]-elev[a]);
  const acc=new Float32Array(g.N);
  for(const i of order) acc[i]+=rainMul[i];
  for(const i of order){
    const x=g.xOf(i),y=g.yOf(i); let best=-1,be=elev[i];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy||!g.inside(x+dx,y+dy)) continue;
      const j=g.idx(x+dx,y+dy), e=land[j]?elev[j]:-1;
      if(e<be){be=e;best=j;}
    }
    if(best>=0&&land[best]) acc[best]+=acc[i];
  }
  const sorted=order.map(i=>acc[i]).sort((a,b)=>b-a);
  const tP=sorted[Math.floor(w.landCount*TUNE.permanentWaterFrac)];
  const tS=sorted[Math.floor(w.landCount*TUNE.seasonalWaterFrac)];
  for(const i of order) water[i]= acc[i]>=tP?2 : acc[i]>=tS?1 : 0;
  let lake=-1,lb=-1;
  for(const i of order) if(elev[i]<w.T.maxElevM*0.11&&acc[i]>lb){lb=acc[i];lake=i;}
  if(lake>=0){
    const lx=g.xOf(lake),ly=g.yOf(lake),r=Math.max(2,Math.round(g.W/48));
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      if(dx*dx+dy*dy>r*r+1||!g.inside(lx+dx,ly+dy)) continue;
      const j=g.idx(lx+dx,ly+dy); if(land[j]) water[j]=2;
    }
  }
}
export function genSoil(w,noise,rand){
  const {g,land,elev,water,fert,gcap,soil,burn,plantB,plantCap}=w;
  const sc=96/g.W, N=g.N;
  for(let i=0;i<N;i++){
    if(!land[i]) continue;
    const x=g.xOf(i),y=g.yOf(i);
    fert[i]=clamp(TUNE.fertBase+TUNE.fertNoiseAmp*(fbm(noise,x*0.055*sc+91,y*0.055*sc+91,4)*2-1)
                  +(water[i]?TUNE.fertWaterBonus:0)-elev[i]/9000, 0.20, 1);
    gcap[i]=w.grassCapBase*fert[i]*clamp(0.60+0.50*w.rainMul[i],0.40,1.60);
    soil[i]=45; burn[i]=-1;
  }
  // 식물 종별 셀 용량 = 기능군 용량 x 종 몫. 초본과 목본이 다른 풀을 쓴다.
  w.simPlants.forEach((id,k)=>{
    const sp=w.species[id], off=k*N;
    for(let i=0;i<N;i++){
      if(!land[i]) continue;
      const capC=(sp.woody? w.woodyCap : gcap[i])*sp.simShare;
      plantCap[off+i]=capC;
      plantB[off+i]=capC*(sp.woody?0.30:0.55+0.3*rand());
    }
  });
}
/* 초식 종마다 '자기 식이의 셀 용량 합'을 미리 재 둔다.
   이동 효용의 feed 항을 이 값으로 정규화하지 않으면, 목본을 먹는 종은
   feed가 6까지 치솟아 갈증 항(최대 4.4)을 압도하고 무리가 물로 가지 않는다. */
export function buildDietMeta(w){
  const N=w.g.N;
  for(const sp of w.species){
    if(!sp.diet||sp.kind!=='ANIMAL'||sp.trophic!=='T2'&&sp.trophic!=='T3') continue;
    sp._slots=sp.diet.map(d=>w.plantIdx.get(d)).filter(v=>v!==undefined);
    sp._mul=sp.diet.map(d=>w.species[d].woody?TUNE.woodyBrowseFrac:1)
                   .filter((_,k)=>w.plantIdx.get(sp.diet[k])!==undefined);
    let tot=0,n=0;
    for(let i=0;i<N;i++){
      if(!w.land[i]) continue;
      let c=0;
      for(let k=0;k<sp._slots.length;k++) c+=w.plantCap[sp._slots[k]*N+i]*sp._mul[k];
      tot+=c; n++;
    }
    sp._capRef=Math.max(tot/Math.max(n,1),1e-6);
  }
  /* 개체 루프에서 종 슬롯을 Map 으로 찾으면 하루 수만 번의 해시 조회가 된다.
     종 객체에 박아 두고 속성으로 읽는다. */
  for(const [id,k] of w.t3Idx) w.species[id]._t3=k;
}

/* 종별 식물 바이오매스를 기능군 합계로 접는다. 화재와 표현이 이 값을 쓴다. */
export function syncPools(w){
  const {g,land,plantB,species,simPlants,grass,woody}=w, N=g.N;
  grass.fill(0); woody.fill(0);
  simPlants.forEach((id,k)=>{
    const dst=species[id].woody?woody:grass, off=k*N;
    for(let i=0;i<N;i++) if(land[i]) dst[i]+=plantB[off+i];
  });
}

export function computeWaterDist(w){
  const {g,land,water,wdist,soil}=w, q=[];
  wdist.fill(999); w.nearCells=0;
  for(let i=0;i<g.N;i++){
    if(!land[i]) continue;
    if(water[i]===2||(water[i]===1&&soil[i]>TUNE.seasonalWaterMinSoilMm)){ wdist[i]=0; q.push(i); }
  }
  w.waterCells=q.length;
  for(let h=0;h<q.length;h++){
    const i=q[h],x=g.xOf(i),y=g.yOf(i);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy||!g.inside(x+dx,y+dy)) continue;
      const j=g.idx(x+dx,y+dy);
      if(land[j]&&wdist[j]>wdist[i]+1){wdist[j]=wdist[i]+1;q.push(j);}
    }
  }
  for(let i=0;i<g.N;i++) if(land[i]&&wdist[i]<=TUNE.drinkRadiusCells) w.nearCells++;
  computeWaterFlow(w);
}
/* 셀마다 '물로 가는 방향'을 미리 적어 둔다.
   수원 기울기는 셀당 1/60 밖에 안 되어 이동 잡음(0.16)에 묻힌다. 무리 시절에는
   매일 아홉 칸을 훑어 평균적으로 옳은 쪽으로 갔지만, 개체는 나흘에 한 번만
   방향을 고르므로 잘못 든 길을 나흘 동안 간다 — 실제로 개체의 1/4이
   완전 탈수 상태로 굶어 죽었다. 목마른 개체는 이 화살표를 그대로 따라간다. */
export function computeWaterFlow(w){
  const {g,land,wdist,flowX,flowY}=w;
  for(let i=0;i<g.N;i++){
    if(!land[i]){ flowX[i]=0; flowY[i]=0; continue; }
    const x=g.xOf(i), y=g.yOf(i);
    let best=wdist[i], bx=0, by=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy) continue;
      if(!g.inside(x+dx,y+dy)) continue;
      const j=g.idx(x+dx,y+dy);
      if(land[j]&&wdist[j]<best){ best=wdist[j]; bx=dx; by=dy; }
    }
    flowX[i]=bx; flowY[i]=by;
  }
}

export function seedFauna(w,rand){
  const {g,land,gcap,species,byTier}=w, idx=[], wgt=[]; let tot=0;
  for(let i=0;i<g.N;i++) if(land[i]){ idx.push(i); wgt.push(gcap[i]); tot+=gcap[i]; }
  const pick=()=>{let r=rand()*tot; for(let k=0;k<idx.length;k++){r-=wgt[k]; if(r<=0)return idx[k];} return idx[0];};
  // T2 : 종별 밀도장
  byTier.T2.forEach(id=>{
    const sp=species[id]; if(sp.status==='ABSENT') return;
    const k=w.t2Idx.get(id), off=k*g.N;
    for(let m=0;m<idx.length;m++) w.t2d[off+idx[m]]=sp.seedN*wgt[m]/tot;
  });
  /* T3 : 개체를 하나씩 놓는다. 다만 섬 전체에 고루 뿌리면 첫 해에 서로를
     못 찾아 모이는 성향이 작동하지 않으므로, 자리 하나에 한 떼씩 몰아 놓는다.
     이 뭉침은 초기 조건일 뿐이고 이후로는 개체들이 알아서 모이고 흩어진다. */
  for(const id of byTier.T3){
    const sp=species[id]; if(sp.status==='ABSENT') continue;
    let left=sp.seedN;
    while(left>0){
      const i=pick(), cx=g.xOf(i), cy=g.yOf(i);
      const size=Math.min(left,TUNE.seedClumpSize); left-=size;
      for(let n=0;n<size;n++){
        const a=newAnimal(w,id,cx+rand(),cy+rand(),0);
        // 나이를 흩는다. 전부 0살로 두면 한 세대가 통째로 같이 늙어 죽는다.
        a.bornDay=-Math.floor(rand()*sp.lifespanYr*365*0.6);
        if(a.ind) a.ind.bornDay=a.bornDay;
        w.ani.push(a);
      }
    }
  }
  /* 첫 버킷을 채운다. 하루 파이프라인은 '어제의 셀 버킷'을 훑으므로
     여기서 넣어 두지 않으면 첫날에 아무도 움직이지 않는다.
     개체 수도 여기서 세어 둔다 — T3 의 sp.n 은 초식 위상이 채우는데,
     첫 판정이 그보다 먼저 와서 멀쩡한 종이 0년차에 절멸로 찍혔다. */
  for(const id of byTier.T3) species[id].n=0;
  for(const a of w.ani){
    species[a.sp].n++;
    const ci=g.idx(clamp(a.x|0,0,g.W-1),clamp(a.y|0,0,g.H-1));
    let l=w.aniAt[ci];
    if(!l) l=w.aniAt[ci]=[];
    if(!l.length) w.aniCells.push(ci);
    l.push(a);
  }
  // T4 · T5 : 전부 개체
  for(const [tier,arr] of [['T4',w.p4],['T5',w.p5]])
    for(const id of byTier[tier]){
      const sp=species[id]; if(sp.status==='ABSENT') continue;
      for(let n=0;n<sp.seedN;n++){
        const i=pick(), ind=newInd(w,id,g.xOf(i)+rand(),g.yOf(i)+rand());
        ind.bornDay=-Math.floor(rand()*sp.lifespanYr*365*0.6);   // 나이 분포를 흩는다
        arr.push(ind);
      }
    }
}
