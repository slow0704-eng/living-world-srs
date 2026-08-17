/* 섬 생태 시뮬레이터 — [S-4] 하루 3위상 — 대형 초식(개체)
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다. */

/* 하루 비용의 대부분이 여기 있다 — XL 프로파일에서 자기시간 85%.
   개체 하나하나가 먹고 마시고 움직이고 낳고 죽는 자리이기 때문이다.
   무리는 객체가 아니라 결과다 [S-4.1].

   [자료구조] 개체는 객체가 아니라 '슬롯'이다.
   61만 개의 JS 객체를 매일 훑으면 산술이 아니라 포인터 추적이 값을 먹는다.
   실측으로 확인했다 — 아홉 칸 효용 스캔(이 위상에서 유일하게 산술다운 부분)을
   통째로 꺼도 273.8 -> 277.5ms 로 전혀 빨라지지 않았다. 병목은 계산이 아니라
   객체 접근이다. 그래서 상태를 필드별 형식화 배열로 눕히고(A), 개체 하나는
   그 배열들의 같은 첨자(슬롯)로만 존재한다.

   부동소수는 Float64Array 를 쓴다. Float32 로 줄이면 메모리는 반이 되지만
   연산 결과가 JS 숫자와 달라져 같은 시드가 다른 세계를 낸다 — [S-0] 위반이다.

   [셀 버킷] 셀마다 배열을 두는 대신 평탄한 Int32Array 하나에 계수 정렬로
   담는다. 정렬은 '안정'이어야 한다 — 같은 칸 안의 처리 순서가 곧 난수를
   받는 순서라, 순서가 바뀌면 세계가 갈라진다. 그래서 지나온 순서대로
   훑으며 각자의 칸 자리에 차례로 놓는다. */

import { ECO } from './01_사양상수.js';
import { TUNE } from './02_튜닝상수.js';
import { clamp, lerp } from './03_유틸.js';
import { newInd, addEv, killInd, linkKin, noteMate, noteCrisis } from './06_개체.js';
import { seasonOf } from './13_환경과화재.js';

/* 사인 코드. 문자열을 슬롯마다 들고 있을 수 없어 숫자로 눕힌다. */
export const CAUSE = ['죽음','아사','갈증','노쇠'];

/* ── 슬롯 저장소 ──────────────────────────────────────────────────────── */
/* 눕히기가 옮기는 것은 곧 '바이트'다 — 대역이 병목이므로 폭이 그대로 값이다.
   그래서 폭을 줄일 수 있는 것은 줄였다.
     sp     T3 종은 셋뿐이고 종 번호도 열 남짓이라 한 바이트면 된다
     px·py  화면 보간 전용이다. 동역학에 되먹여지지 않으므로 Float32 로 족하다
   되먹여지는 값(x·y·e·hyd·dx·dy)은 Float64 그대로다. 좁히면 연산 결과가
   JS 숫자와 달라져 같은 시드가 다른 세계를 낸다. */
const LAYOUT={ sp:Uint8Array, bornDay:Int32Array,
  x:Float64Array, y:Float64Array, px:Float32Array, py:Float32Array,
  e:Float64Array, hyd:Float64Array, dx:Float64Array, dy:Float64Array,
  phase:Uint8Array, male:Uint8Array, dead:Uint8Array };
const FIELDS=Object.keys(LAYOUT);
export function makeAnimals(cap){
  const A={ cap, top:0, ind:new Array(cap).fill(null),
    /* 아래 둘은 눕히기에서 뺀다 — 죽은 그날 안에 쓰이고 버려지므로
       다음 날까지 살아남을 필요가 없다. 옮기지 않는 만큼 바이트가 준다. */
    deadBy:new Int32Array(cap), cause:new Uint8Array(cap) };
  for(const f of FIELDS) A[f]=new LAYOUT[f](cap);
  return A;
}
function growAnimals(A){
  const cap=Math.ceil(A.cap*1.6);
  const F=k=>{ const t=new k.constructor(cap); t.set(k); return t; };
  for(const k of FIELDS) A[k]=F(A[k]);
  A.deadBy=F(A.deadBy); A.cause=F(A.cause);
  const ind=new Array(cap).fill(null);
  for(let i=0;i<A.top;i++) ind[i]=A.ind[i];
  A.ind=ind; A.cap=cap;
}
function growI32(a,need){
  const t=new Int32Array(Math.max(need,Math.ceil(a.length*1.6)||1024)); t.set(a); return t;
}
function allocSlot(w){
  const A=w.A;
  if(A.top>=A.cap) growAnimals(A);
  return A.top++;
}
/* ── 슬롯을 셀 순서로 다시 눕힌다 ──────────────────────────────────────────
   [M-14.5] 남은 병목은 메모리 지연으로 보였다. 버킷을 따라가면 개체 기록이
   메모리 여기저기에 흩어져 있어, 한 마리를 만질 때마다 캐시가 새로 채워진다.
   그래서 하루에 한 번 개체를 '버킷 순서 그대로' 다시 눕힌다.

   눕히고 나면 버킷 내용이 0,1,2,... 항등이 되므로 슬롯 목록 자체가 필요
   없어진다 — 셀의 시작 위치에서 개수만큼 이어서 읽으면 그것이 그 칸의
   개체들이다. 덤으로 자유목록과 지연 해제가 통째로 사라진다. 살아 있는 것이
   항상 앞쪽에 빈틈없이 모이므로 되돌려줄 자리라는 개념이 없다.

   처리 순서(= 난수를 받는 순서)는 버킷 순서 그대로이므로 결과는 변하지 않는다. */
/* 버킷을 짜고 그 순서대로 개체를 눕힌다. 둘은 언제나 함께여야 한다 —
   눕히지 않으면 버킷 내용이 항등이 아니라서 순회가 엉뚱한 슬롯을 읽는다. */
export function layoutAnimals(w,n){
  permuteAnimals(w,buildBuckets(w,n),n);
}
function permuteAnimals(w,perm,n){
  const A=w.A; let A2=w.A2;
  if(A2.cap<n){ w.A2=A2=makeAnimals(Math.ceil(n*1.3)); }
  for(const f of FIELDS){
    const src=A[f], dst=A2[f];
    for(let k=0;k<n;k++) dst[k]=src[perm[k]];
  }
  const si=A.ind, di=A2.ind;
  for(let k=0;k<n;k++){
    const ind=si[perm[k]];
    di[k]=ind;
    if(ind) ind.slot=k;
  }
  A2.top=n; w.A=A2; w.A2=A;
}

/* 이동은 두 벌이다. 초식은 슬롯(형식화 배열), 포식자는 아직 객체다 —
   포식자는 수가 적어(수백~수천) 눕힐 이득이 없고, 이름 · 계보 · 동선을
   그대로 들고 다녀야 해서 객체가 더 알맞다. 식은 같다. */
export function moveBy(w,o,dx,dy,stepC){
  if(!dx&&!dy) return;
  /* Math.hypot 은 정확도를 지키느라 느리다. 하루 수만 번 부르는 자리라
     제곱근으로 직접 계산한다(값의 범위가 좁아 넘칠 일이 없다). */
  const {g,land}=w, len=Math.sqrt(dx*dx+dy*dy);
  let nx=o.x+dx/len*stepC, ny=o.y+dy/len*stepC;
  for(let t=0;t<4;t++){
    const cx=clamp(nx,0.5,g.W-1.5)|0, cy=clamp(ny,0.5,g.H-1.5)|0;
    if(land[g.idx(cx,cy)]){ o.x=clamp(nx,0.5,g.W-1.5); o.y=clamp(ny,0.5,g.H-1.5); return; }
    nx=(nx+o.x)/2; ny=(ny+o.y)/2;
  }
}
export function moveSlot(w,A,i,dx,dy,stepC){
  if(!dx&&!dy) return;
  const {g,land}=w, len=Math.sqrt(dx*dx+dy*dy);
  let nx=A.x[i]+dx/len*stepC, ny=A.y[i]+dy/len*stepC;
  for(let t=0;t<4;t++){
    const cx=clamp(nx,0.5,g.W-1.5)|0, cy=clamp(ny,0.5,g.H-1.5)|0;
    if(land[g.idx(cx,cy)]){ A.x[i]=clamp(nx,0.5,g.W-1.5); A.y[i]=clamp(ny,0.5,g.H-1.5); return; }
    nx=(nx+A.x[i])/2; ny=(ny+A.y[i])/2;
  }
}

export function buildMoveFields(w){
  const {g,land,plantB,fear,press,densPrev,uf,wpull,wdist,species}=w, N=g.N;
  const dens=densPrev;                        // 어제의 분포로 오늘을 정한다
  for(let j=0;j<N;j++)
    wpull[j]=land[j]?1-clamp(wdist[j]/TUNE.waterGradientCells,0,1):0;
  /* 먹이 항은 따로 깐다. 개체마다 배고픈 정도가 달라 가중치가 다르기 때문이다 —
     한 필드에 미리 곱해 넣으면 모두가 같은 무게로 먹이를 찾게 된다. */
  for(const id of w.byTier.T3){
    const sp=species[id]; if(sp.status==='ABSENT') continue;
    /* util 과 feedF 를 한 배열에 번갈아 담는다. 아홉 칸 스캔이 두 값을
       늘 짝으로 읽으므로, 붙여 두면 캐시 라인 하나로 둘 다 온다. */
    const o=sp._t3*N, o2=o*2, sl=sp._slots, ml=sp._mul;
    for(let j=0;j<N;j++){
      const q=o2+j*2;
      if(!land[j]){ uf[q]=-Infinity; uf[q+1]=0; continue; }
      let f=0;
      for(let m=0;m<sl.length;m++) f+=plantB[sl[m]*N+j]*ml[m];
      uf[q+1]=clamp(f/sp._capRef,0,1);
      const flock=clamp(dens[o+j]/TUNE.flockRef,0,1);      // 어제의 동종 분포
      uf[q]=TUNE.flockPull*flock
           -TUNE.utilFear*fear[j]-TUNE.utilCrowd*press[j];
    }
  }
}

/* 지나온 순서를 그대로 지키며 셀별로 모아 담는다(안정 계수 정렬).
   ordSlot/ordCell 은 처리 순서, cells 는 칸이 처음 채워진 순서다. */
function buildBuckets(w,ordN){
  const {ordSlot,ordCell}=w, B=w.bNext;
  const start=B.start, cnt=B.cnt, cur=B.cur, cells=B.cells;
  let at=0;
  for(let c=0;c<B.cellsN;c++) cnt[cells[c]]=0;
  B.cellsN=0;
  for(let k=0;k<ordN;k++){
    const ci=ordCell[k];
    if(cnt[ci]++===0) cells[B.cellsN++]=ci;
  }
  for(let c=0;c<B.cellsN;c++){ const ci=cells[c]; start[ci]=at; cur[ci]=at; at+=cnt[ci]; }
  if(B.slot.length<ordN) B.slot=new Int32Array(Math.ceil(ordN*1.6));
  const perm=B.slot;
  for(let k=0;k<ordN;k++) perm[cur[ordCell[k]]++]=ordSlot[k];
  const t=w.b; w.b=w.bNext; w.bNext=t;
  return perm;
}

export function phaseHerds(w){
  const {g,land,wdist,fear,press,uf,wpull,C,species,plantB}=w, rng=w.rng, N=g.N;
  const A=w.A, B=w.b;
  const s=seasonOf(w);
  /* 밀도장은 두 벌을 번갈아 쓴다. 오늘 분포를 채우는 동안 어제 분포가
     그대로 남아 있어야 '어제 그 셀에 몇이 모여 있었나'를 읽을 수 있다. */
  const tmp=w.densPrev; w.densPrev=w.dens; w.dens=tmp;
  buildMoveFields(w);                         // 어제 분포로 오늘의 지형 선호를 깐다
  press.fill(0); w.dens.fill(0);

  const stepGraze=TUNE.moveGrazeKmDay/w.cellKm, stepThirst=TUNE.moveThirstKmDay/w.cellKm;
  const today=w.year*365+w.day;
  const roomToBreed=w.aniLive<w.aniBudget;                          // [T-12] 연산 예산
  const nT3=Math.max(1,w.byTier.T3.length);
  const cnt=w.t3Cnt, sat=w.t3Sat;
  let satS=0,satN=0,tracked=0,born=0,ordN=0,live=0;
  for(const sp of species) if(sp.trophic==='T3') sp.n=0;
  /* ord 는 순회 중에도 커질 수 있다 — 새끼가 나면 슬롯 저장소가 늘고,
     그때 이 버퍼가 따라 늘지 않으면 형식화 배열은 범위 밖 쓰기를 조용히
     버린다. 개체가 소리 없이 사라지고 세계가 갈라진다. */
  let ordSlot=w.ordSlot, ordCell=w.ordCell;

  /* 셀 단위로 돈다. 같은 자리에 있는 개체들은 그 셀의 풀을 나눠 먹는다.
     개체마다 식물 배열을 따로 읽고 쓰면 수만 번의 무작위 접근이 되어
     하루가 감당이 안 된다 — 셀에서 한 번 계산해 나누는 편이 빠르고,
     '먼저 도착한 놈이 다 먹는다'는 순서 편향도 없앤다. */
  for(let c=0;c<B.cellsN;c++){
    const ci=B.cells[c], st=B.start[ci], len=B.cnt[ci];
    if(!len) continue;
    const end=st+len;
    for(let k=0;k<nT3;k++){ cnt[k]=0; sat[k]=1; }
    for(let i=st;i<end;i++) if(!A.dead[i]) cnt[species[A.sp[i]]._t3]++;
    for(let k=0;k<nT3;k++){
      if(!cnt[k]) continue;
      const sp=species[w.byTier.T3[k]], sl=sp._slots, ml=sp._mul;
      let avail=0;
      for(let m=0;m<sl.length;m++) avail+=plantB[sl[m]*N+ci]*ml[m]*C.browseAvailability;
      const demand=cnt[k]*sp.massKg*ECO.dailyIntakeFrac/1000;
      const taken=Math.min(avail,demand);
      if(avail>0&&taken>0) for(let m=0;m<sl.length;m++){
        const o=sl[m]*N+ci;
        plantB[o]-=taken*(plantB[o]*ml[m]/(avail/C.browseAvailability));
      }
      sat[k]=demand>0?taken/demand:1;
      satS+=sat[k]*cnt[k]; satN+=cnt[k];
    }

    for(let i=st;i<end;i++){
      if(A.dead[i]) continue;
      const sp=species[A.sp[i]], slot=sp._t3;

      /* 물 : 건기마다 마르고 채우기를 반복한다. 죽기 직전이었을 때만 기록에 남긴다. */
      const wasParched=A.hyd[i]<0.05;
      A.hyd[i]=clamp(A.hyd[i]-1/(TUNE.hydrationDays*sp.droughtMul),0,1);
      if(wdist[ci]<=TUNE.drinkRadiusCells){ A.hyd[i]=1;
        if(wasParched&&A.ind[i]) addEv(w,A.ind[i],'move','말라죽기 직전 수원에 닿음'); }

      A.e[i]=clamp(A.e[i]+(sat[slot]-TUNE.satietyBreakEven)*TUNE.energyGainRate
                -TUNE.dehydrationPenalty*clamp((TUNE.dehydrationOnset-A.hyd[i])/TUNE.dehydrationOnset,0,1),0,1);

      /* 하루 시작 위치. 상태는 하루에 한 번만 갱신되므로 화면이 그대로 그리면
         개체가 툭툭 튄다. 표현 계층이 이 값과 보간해 잇는다. */
      A.px[i]=A.x[i]; A.py[i]=A.y[i];

      if(A.hyd[i]<TUNE.thirstSeek){
        /* 목이 마르면 먹이도 무리도 뒤로 밀린다. 셀에 적힌 물 방향을 따라간다. */
        A.dx[i]=w.flowX[ci]+(rng()-0.5)*0.4; A.dy[i]=w.flowY[ci]+(rng()-0.5)*0.4;
      } else if(A.e[i]<TUNE.hungerUrgent||(today+A.phase[i])%TUNE.decideEvery===0){
        /* 아홉 칸 중 가장 나은 쪽. 셀 성분은 util 에 깔려 있고, 여기서는
           자기 갈증과 자기 허기를 얹는다. 굶주릴수록 먹이 쪽 무게가 커지고
           (허기 절박성), 절박하면 나흘을 기다리지 않고 매일 방향을 고친다. */
        const uo=slot*N*2, cx=g.xOf(ci), cy=g.yOf(ci);
        const thirst=TUNE.utilThirst*(1-A.hyd[i]);
        const feedW=TUNE.utilFeed+TUNE.hungerPull*(1-A.e[i]);
        let bs=-Infinity, bx=0, by=0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const nx=cx+dx, ny=cy+dy;
          if(nx<0||ny<0||nx>=g.W||ny>=g.H) continue;
          const j=g.idx(nx,ny);
          if(!land[j]) continue;
          const q=uo+j*2;
          const v=uf[q]+feedW*uf[q+1]+thirst*wpull[j]+rng()*TUNE.utilNoise;
          if(v>bs){ bs=v; bx=dx; by=dy; }
        }
        A.dx[i]=bx; A.dy[i]=by;
      }
      /* 걸음도 절박함을 탄다. 목마르면 물을 찾아 멀리 가고(최대 12배),
         굶주리면 그 절반까지는 더 나선다 — 자리에 앉아 굶지는 않는다. */
      const urge=Math.max(1-A.hyd[i],TUNE.hungerRoam*(1-A.e[i]));
      /* 손으로 펼쳐 봤지만 한 푼도 빨라지지 않아 되돌렸다([M-14.10]).
         프로파일의 자기시간 8.9% 는 '호출 비용'이 아니라 그 안에서 하는 일이었다. */
      moveSlot(w,A,i,A.dx[i],A.dy[i],lerp(stepGraze,stepThirst,urge)*sp.moveMul);

      const ni=g.idx(clamp(A.x[i]|0,0,g.W-1),clamp(A.y[i]|0,0,g.H-1));
      press[ni]+=1; w.dens[slot*N+ni]+=1;
      if(ordN>=ordSlot.length){ w.ordSlot=ordSlot=growI32(ordSlot,ordN+1);
                                w.ordCell=ordCell=growI32(ordCell,ordN+1); }
      ordSlot[ordN]=i; ordCell[ordN]=ni; ordN++; live++;
      sp.n++;

      const ind=A.ind[i];
      if(ind){
        tracked++;
        ind.x=A.x[i]; ind.y=A.y[i]; ind.px=A.px[i]; ind.py=A.py[i];
        ind.e=A.e[i]; ind.hyd=A.hyd[i];
        noteCrisis(w,ind,A.e[i]);          // 굶주림 위기와 극복
        /* '최대 무리'는 어제 그 자리에 함께 있던 동종의 수다.
           무리라는 객체가 없으니 업적도 모인 결과로 잰다. */
        const together=w.densPrev[slot*N+ci];
        if(together>ind.peakHerd){
          const was=ind.peakHerd; ind.peakHerd=together;
          for(const mark of [50,100,200,400])
            if(was<mark&&together>=mark) addEv(w,ind,'move',`${mark}마리 무리 속에 있었음`);
        }
        if(today%TUNE.trackSampleDays===0){
          ind.track.push([today,A.x[i],A.y[i]]);
          if(ind.track.length>TUNE.trackMaxPoints) ind.track.shift();
        }
      }

      /* 번식 : 우기에 에너지가 남은 암컷이, 곁에 수컷이 있을 때 낳는다.
         짝을 요구하면 밀도가 낮을 때 번식이 저절로 막힌다(앨리 효과).
         낳는 쪽을 암컷으로 한정했으므로 확률은 두 배로 둔다 — 개체군 수준의
         출생률은 무리 시절과 같게 유지하고, 짝 찾기 실패만 새로 더해진 것이다. */
      const age=(today-A.bornDay[i])/365;
      sp.ageSum+=age; sp.ageN++;
      /* 다 자란 암컷만 낳는다. 예전에는 초식만 이 조건이 없어서 갓 태어난
         개체도 낳았다 — 큰 종이 늦게 성숙하는 알로메트리가 초식에서만
         빠져 있었고, 인구 피라미드가 실제보다 젊었다. */
      if(s.wet&&roomToBreed&&!A.male[i]&&age>=sp.matureYr){
        const p=TUNE.birthRate*2*sp.breedMul*clamp((A.e[i]-TUNE.birthEnergyMin)/TUNE.birthEnergySpan,0,1);
        if(p>0&&rng()<p){
          const mate=findMate(w,i,ci,rng);
          if(mate>=0){
          const c=newAnimal(w,A.sp[i],A.x[i]+rng()-.5,A.y[i]+rng()-.5,today);
          A.e[c]=0.5; born++; sp.bornYr++;
          const cj=g.idx(clamp(A.x[c]|0,0,g.W-1),clamp(A.y[c]|0,0,g.H-1));
          if(ordN>=ordSlot.length){ w.ordSlot=ordSlot=growI32(ordSlot,ordN+1);
                                    w.ordCell=ordCell=growI32(ordCell,ordN+1); }
          ordSlot[ordN]=c; ordCell[ordN]=cj; ordN++; live++;
          sp.n++;
          const mInd=A.ind[mate];
          if(mInd) mInd.offspring++;
          /* 한쪽만 추적 중이면 짝도 올린다. 그러지 않으면 배우자와 형제가
             기록에 거의 남지 않는다 — 표본끼리 만날 확률이 낮기 때문이다. */
          if(A.ind[i]&&!A.ind[mate]&&w.trackedAlive<TUNE.trackedAlive) attachInd(w,mate);
          if(A.ind[i]||A.ind[mate]){
            if(A.ind[i]){
              A.ind[i].offspring++;
              if(A.ind[i].offspring===1) addEv(w,A.ind[i],'breed','첫 새끼를 남김');
            }
            /* 부모를 추적 중이면 자식도 추적해 계보를 잇는다.
               그래야 생애 화면에서 부모와 자식을 오갈 수 있다. */
            if(!A.ind[c]&&w.trackedAlive<TUNE.trackedAlive) attachInd(w,c);
            if(A.ind[c]){
              linkKin(w,A.ind[i],A.ind[c],A.ind[mate]);
              const who=A.ind[i]?A.ind[i].name:A.ind[mate].name;
              addEv(w,A.ind[c],'birth',`${who}의 새끼로 태어남`);
            }
            if(A.ind[i]&&A.ind[mate]) noteMate(w,A.ind[i],A.ind[mate]);
          }
          }
        }
      }
      /* 죽음 : 굶주림 · 갈증 · 노쇠. 무리 시절에는 사망률이 마릿수에 곱해지는
         연속량이었지만, 이제는 이 한 마리가 죽느냐 마느냐다. */
      const senes=age>sp.lifespanYr?0.006:age>sp.lifespanYr*0.8?0.0012:0;
      const dp=TUNE.deathRate*clamp((TUNE.deathEnergyMax-A.e[i])/TUNE.deathEnergyMax,0,1)+senes;
      if(dp>0&&rng()<dp){
        A.dead[i]=1;
        A.deadBy[i]=-1;
        /* 갈증을 먼저 본다. 탈수는 에너지를 직접 깎으므로(dehydrationPenalty),
           에너지부터 검사하면 목말라 죽은 개체가 전부 '아사'로 찍힌다 —
           실제로 M 티어의 사인 90%가 아사로 나왔는데 포만도는 0.94였다.
           먹이는 남았고 물이 없었던 것이다. 기준은 탈수 페널티가 걸리기
           시작하는 선(dehydrationOnset)이다. 그 아래면 깎이는 중이었다. */
        A.cause[i]=A.hyd[i]<TUNE.dehydrationOnset?2
                  :A.e[i]<TUNE.deathEnergyMax*0.5?1:3;
        w.deadQ.push(i); live--;
        /* 오늘 죽은 것도 오늘 버킷에는 남는다(원본과 같다). 내일 훑으며
           걸러지고, 그때 비로소 배열에서 빠진다. */
      }
    }
  }
  const perm=buildBuckets(w,ordN); // 오늘 채운 것이 내일의 '어제 자리'가 된다
  w.aniLive=live;
  w.acc.bYr+=born;
  drainDead(w);                    // 옛 번호를 쓰므로 눕히기 전에 끝내야 한다
  permuteAnimals(w,perm,ordN);     // 셀 순서로 다시 눕힌다 [M-14.5]
  w.env.satiety=satN?satS/satN:1;
  w.trackedAlive=tracked;
}

/* 개체 하나를 만든다. 표본만 이름 · 동선 · 사건을 갖는다 —
   수만 마리 전부에 붙이면 이름 문자열과 배열만으로 메모리가 무너진다. */
export function newAnimal(w,spId,x,y,bornDay){
  const male=w.rng()<0.5;
  const i=allocSlot(w), A=w.A;
  A.sp[i]=spId; A.x[i]=x; A.y[i]=y; A.px[i]=x; A.py[i]=y;
  A.e[i]=0.7; A.hyd[i]=1; A.male[i]=male?1:0;
  A.bornDay[i]=bornDay; A.dx[i]=0; A.dy[i]=0;
  A.phase[i]=(w.uid*7)%TUNE.decideEvery;
  A.ind[i]=null; A.dead[i]=0; A.deadBy[i]=-1; A.cause[i]=0;
  if(w.trackedAlive<TUNE.trackedAlive&&w.rng()<TUNE.trackedRate) attachInd(w,i);
  return i;
}
/* 추적 대상으로 승격한다. 지도에서 고른 개체도 이 길로 들어온다. */
export function attachInd(w,i){
  const A=w.A;
  if(A.ind[i]) return A.ind[i];
  const ind=newInd(w,A.sp[i],A.x[i],A.y[i]);
  ind.bornDay=A.bornDay[i]; ind.e=A.e[i]; ind.hyd=A.hyd[i]; ind.slot=i;
  ind.sex=A.male[i]?'M':'F';
  A.ind[i]=ind; w.trackedAlive++;
  return ind;
}

export function findMate(w,i,ci,rng){
  const g=w.g, A=w.A, B=w.b, cx=g.xOf(ci), cy=g.yOf(ci);
  const sp=A.sp[i], male=A.male[i];
  {
    const st=B.start[ci], len=B.cnt[ci];
    if(len) for(let k=0;k<len;k++){
      const b=st+(k+((rng()*len)|0))%len;
      if(b!==i&&!A.dead[b]&&A.sp[b]===sp&&A.male[b]!==male) return b;
    }
  }
  /* 반경은 km 로 정해 격자에 맞춰 환산한 값이다 — 셀 개수로 박아 두면
     고운 격자(작은 섬)에서 짝 찾기가 가혹해져 절멸 나선이 생긴다. */
  const R=w.mateRadiusHerb;
  for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
    if(!dx&&!dy) continue;
    if(!g.inside(cx+dx,cy+dy)) continue;
    const nj=g.idx(cx+dx,cy+dy), st=B.start[nj], len=B.cnt[nj];
    if(!len) continue;
    for(let b=st;b<st+len;b++)
      if(!A.dead[b]&&A.sp[b]===sp&&A.male[b]!==male) return b;
  }
  return -1;
}

/* 죽은 개체의 뒤처리. 예전에는 이 자리에서 살아 있는 개체 전부를 훑어
   배열을 압축했다(sweepDead) — XL에서 하루 61만 개를 두 번 훑는 셈이라
   프로파일 자기시간의 6.6%가 여기 있었다. 압축은 이제 phaseHerds 가 하루에
   한 번 도는 그 순회 안에서 공짜로 된다(살아남은 것만 담으면 그것이 압축이다).
   그래서 여기 남는 일은 '죽은 것만' 처리하는 것뿐이고, 비용이 개체 수가
   아니라 사망자 수에 매인다.

   뒤처리를 죽는 순간에 하지 않고 큐에 미루는 이유가 있다. trackedAlive 가
   즉시 줄면 같은 하루 안의 뒤쪽 개체가 추적 슬롯을 더 얻게 되고,
   attachInd 가 난수를 뽑으므로 난수 스트림이 어긋나 세계가 갈라진다.
   호출 지점을 sweepDead 와 똑같이 두면 결과가 한 마리도 달라지지 않는다. */
export function drainDead(w){
  const q=w.deadQ, A=w.A;
  for(let k=0;k<q.length;k++){
    const i=q[k];
    const ind=A.ind[i];
    if(ind){ killInd(w,ind,A.deadBy[i]>=0?`${w.species[A.deadBy[i]].name}에게 죽음`
                                         :CAUSE[A.cause[i]]);
      ind.slot=-1; A.ind[i]=null; w.trackedAlive--; }
    const dsp=w.species[A.sp[i]];
    dsp.n--; w.acc.dYr++;
    /* 사인은 죽는 순간의 상태로 가른다. 라벨을 여기서 다시 만들지 않고
       그대로 쓰는 이유는, 명예의 전당 · 개체 기록과 같은 말을 써야
       두 표를 나란히 놓고 읽을 수 있기 때문이다. */
    if(A.deadBy[i]>=0) dsp.eatenYr++;
    else { dsp.diedYr++;
      const c=A.cause[i];
      if(c===1) dsp.starvedYr++;
      else if(c===2) dsp.thirstYr++;
      else dsp.agedYr++; }
  }
  q.length=0;
}
