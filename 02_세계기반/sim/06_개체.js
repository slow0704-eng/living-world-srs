/* 섬 생태 시뮬레이터 — [I-9.3][I-9.4] 개체 추적 — 나이 · 동선 · 생애 사건
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

import { TUNE } from './02_튜닝상수.js';

/* 개체 : 추적 대상만 만든다 [I-9.3][I-9.4] */
export function newInd(w,spId,x,y){
  const sp=w.species[spId];
  const ind={ uid:w.uid++, sp:spId, name:`${sp.name} #${w.uid-1}`,
    sex: w.rng()<0.5?'M':'F', bornDay:w.year*365+w.day, deathDay:null, cause:null,
    x,y, e:0.7, hyd:1, herd:null, kills:0, offspring:0,
    track:[[w.year*365+w.day,x,y]], ev:[] };
  addEv(w,ind,'birth','태어남');
  w.inds.push(ind);
  return ind;
}
export function addEv(w,ind,kind,text){
  ind.ev.push([w.year*365+w.day,kind,text]);
  if(ind.ev.length>TUNE.eventMax) ind.ev.splice(0,ind.ev.length-TUNE.eventMax);
}
export function killInd(w,ind,cause){
  ind.deathDay=w.year*365+w.day; ind.cause=cause;
  addEv(w,ind,'death',cause);
  w.dead.push(ind);
  if(w.dead.length>TUNE.deadRegistryMax) w.dead.shift();
}
export const indAge=(w,ind)=>((ind.deathDay??(w.year*365+w.day))-ind.bornDay)/365;
