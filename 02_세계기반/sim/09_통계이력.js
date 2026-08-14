/* 섬 생태 시뮬레이터 — 통계 · 표본 · 연도 마감 · 크로니클
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

import { ECO } from './01_사양상수.js';
import { TUNE } from './02_튜닝상수.js';
import { clamp } from './03_유틸.js';
import { trackSpecies } from './12_종발자취.js';

/* 화면 갱신 플래그. 모듈 경계를 넘어 대입할 수 없으므로 설정 함수를 함께 낸다. */
export let chronDirty = true;
export const setChronDirty = v => { chronDirty = v; };

export function refreshSpeciesCounts(w){
  const N=w.g.N;
  /* T3 는 개체 위상에서 이미 세었다(sp.n). 여기서 다시 훑으면
     수만 마리를 공짜로 한 번 더 도는 셈이라 그대로 둔다. */
  for(const sp of w.species) if(sp.kind==='ANIMAL'&&!sp.aggregate&&sp.trophic!=='T3') sp.n=0;
  for(const p of w.p4) w.species[p.sp].n++;
  for(const p of w.p5) w.species[p.sp].n++;
  for(const id of w.byTier.T2){
    const sp=w.species[id]; if(sp.status==='ABSENT') continue;
    const off=w.t2Idx.get(id)*N; let s=0;
    for(let i=0;i<N;i++) s+=w.t2d[off+i];
    sp.n=s;
  }
  for(const sp of w.species){
    if(sp.kind!=='ANIMAL'||sp.aggregate||sp.status==='ABSENT') continue;
    if(sp.n<0.5&&sp.extinctYear==null){
      sp.extinctYear=w.year; w.totals.extinct++;
      logChron(w,'loss',`${sp.name} 절멸 (${sp.trophic}) — ${w.year}년차`);
    }
  }
}
export const tierCount=(w,t)=>{let n=0; for(const id of w.byTier[t]) n+=w.species[id].n||0; return n;};
export const aliveSpecies=(w,t)=>w.byTier[t].filter(id=>w.species[id].status!=='ABSENT'&&w.species[id].n>=0.5).length;

export function collectStats(w){
  const n1=w.n1, n2=tierCount(w,'T2'), n3=w.ani.length, n4=w.p4.length, n5=w.p5.length;
  /* 수원 밀집도와 '가장 큰 무리'는 개체 분포에서 직접 센다.
     무리라는 객체가 없어졌으므로, 무리는 이제 한 셀에 몇이 모였는가로 읽는다. */
  let near=0, clumpCells=0, biggest=0;
  for(const ci of w.aniCells){
    const lst=w.aniAt[ci]; if(!lst.length) continue;
    clumpCells++;
    if(lst.length>biggest) biggest=lst.length;
    if(w.land[ci]&&w.wdist[ci]<=TUNE.drinkRadiusCells) near+=lst.length;
  }
  const dIsl=n3/w.landCount, dNear=near/Math.max(w.nearCells,1);
  return { n1,n2,n3,n4,n5, year:w.year, day:w.day, wet:w.env.wet, tempC:w.env.tempC,
    rainMm:w.env.rainMm, soilMm:w.env.soilMm, grassT:w.env.grassT, woodyFrac:w.env.woodyFrac,
    burning:w.env.burning, waterCells:w.waterCells,
    grassFill:w.env.grassFill, grassCapT:w.env.grassCapT,
    clumpCells, biggestClump:biggest,
    herdAvg:clumpCells?n3/clumpCells:0,
    energy:w.ani.length?w.ani.reduce((s,a)=>s+a.e,0)/w.ani.length:0,
    pio:dIsl>0?clamp(dNear/dIsl,0,99):1,
    specAlive:['T2','T3','T4','T5'].reduce((s,t)=>s+aliveSpecies(w,t),0),
    specTotal:w.species.filter(s=>s.kind==='ANIMAL'&&!s.aggregate&&s.status!=='ABSENT').length,
    inds:w.inds.length, last:w.last, totals:w.totals, cap:w.cap };
}
export function recordSample(w){
  const t=w.year+w.day/365;
  /* 종별 값도 함께 남긴다. 등급 합계만 있으면 "어느 종이 무너지는 중인가"를
     그래프에서 볼 수 없다. 종은 열 남짓이라 표본 하나가 크게 무겁지 않다. */
  const per=w.trackedSpec.map(id=>Math.round(w.species[id].n));
  w.samples.push({t, T1:w.n1, T2:tierCount(w,'T2'), T3:tierCount(w,'T3'), T4:w.p4.length, T5:w.p5.length,
    per, grass:w.env.grassT, grassFill:w.env.grassFill*100, woodyPct:w.env.woodyFrac*100,
    s2:aliveSpecies(w,'T2'), s3:aliveSpecies(w,'T3'),
    s4:aliveSpecies(w,'T4'), s5:aliveSpecies(w,'T5')});
  if(w.samples.length>600){ w.samples=w.samples.filter((_,i)=>i%2===0); w.sampleEvery*=2; }
  const last=w.samples[w.samples.length-1];
  for(const k of ['T1','T2','T3','T4','T5']){
    const v=last[k], p=w.peaks[k];
    if(!p) w.peaks[k]={max:v,maxT:w.year,min:v,minT:w.year};
    else { if(v>p.max){p.max=v;p.maxT=w.year;} if(v<p.min){p.min=v;p.minT=w.year;} }
  }
}
export function closeYear(w){
  const a=w.acc;
  w.last={births:a.bYr,deaths:a.dYr,kills:a.killYr,burnFrac:a.burnedYr/w.landCount,fires:a.fireCount};
  w.totals.births+=a.bYr; w.totals.deaths+=a.dYr; w.totals.kills+=a.killYr;
  w.totals.burned+=a.burnedYr; w.totals.fires+=a.fireCount;
  w.years.push({year:w.year, T1:Math.round(w.n1), T2:Math.round(tierCount(w,'T2')), T3:Math.round(tierCount(w,'T3')),
    T4:w.p4.length, T5:w.p5.length, grassKt:w.env.grassT/1000, woodyPct:w.env.woodyFrac*100,
    burnPct:w.last.burnFrac*100, fires:a.fireCount, species:collectStats(w).specAlive,
    grassFill:w.env.grassFill*100,
    births:Math.round(a.bYr), deaths:Math.round(a.dYr)});
  if(w.last.burnFrac>=TUNE.fireBigEventFrac)
    logChron(w,'fire',`${(w.last.burnFrac*100).toFixed(0)}% 소실 · 발화 ${a.fireCount}건`);
  trackSpecies(w);          // 종의 발자취 — 연 단위로만 판정한다
  w.day=0; w.year++;
  w.acc={bYr:0,dYr:0,killYr:0,burnedYr:0,fireCount:0};
}
export function watchEvents(w){
  const f=w.flags;
  const chk=(k,cond,kind,msg)=>{ if(cond&&!f[k]){f[k]=true; logChron(w,kind,msg);} else if(!cond&&f[k]) f[k]=false; };
  chk('woody', w.env.woodyFrac>0.70,'loss','목본 임관 70% 돌파 — 초지가 관목림으로 천이 중');
  chk('t3low', tierCount(w,'T3')<w.cap.T3*0.25,'loss','T3 개체군 부양력의 25% 미만');
}
export function logChron(w,kind,msg){
  w.chron.push({y:w.year,d:w.day,kind,msg});
  if(w.chron.length>300) w.chron.shift();
  chronDirty=true;
}
