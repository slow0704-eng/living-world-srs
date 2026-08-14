/* 섬 생태 시뮬레이터 — [I-9.3][I-9.4] 개체 추적 — 나이 · 동선 · 생애 사건
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다. */

import { TUNE } from './02_튜닝상수.js';

/* 개체 : 추적 대상만 만든다 [I-9.3][I-9.4] */
export function newInd(w,spId,x,y){
  const sp=w.species[spId];
  const ind={ uid:w.uid++, sp:spId, name:`${sp.name} #${w.uid-1}`,
    sex: w.rng()<0.5?'M':'F', bornDay:w.year*365+w.day, deathDay:null, cause:null, fate:null,
    x,y, e:0.7, hyd:1, herd:null, kills:0, offspring:0, peakHerd:0,
    parent:null, parent2:null, children:[], mates:[],   // 계보 · 짝

    track:[[w.year*365+w.day,x,y]], ev:[] };
  addEv(w,ind,'birth','태어남');
  w.inds.push(ind);
  return ind;
}
/* 사건 버퍼가 넘치면 가운데를 버린다. 앞에서부터 밀어내면 '태어남'과
   초기 사건이 먼저 사라져, 생애가 말년 몇 줄만 남은 토막이 된다. */
const EV_KEEP_HEAD=6;
export function addEv(w,ind,kind,text){
  ind.ev.push([w.year*365+w.day,kind,text]);
  if(ind.ev.length>TUNE.eventMax) ind.ev.splice(EV_KEEP_HEAD,ind.ev.length-TUNE.eventMax);
}
/* fate 는 '왜 명부에서 빠졌는가'를 구분한다.
   'death' 는 실제 죽음, 'merge' 는 무리가 흡수되며 대표 자리를 잃은 것이다.
   둘을 섞으면 수명 통계가 무리 병합 주기로 오염된다 (명예의 전당은 이 값으로 거른다). */
const DEAD_TRACK_KEEP=12;
export function killInd(w,ind,cause,fate='death'){
  ind.deathDay=w.year*365+w.day; ind.cause=cause; ind.fate=fate;
  /* 죽은 개체의 동선은 성기게 남긴다. w.inds 는 한 번 만든 개체를 지우지 않으므로
     (명예의 전당이 판 전체를 훑어야 한다) 90점을 그대로 들고 있으면
     수만 마리분이 쌓여 장기 실행에서 메모리가 붓는다. 모양만 남기면 된다. */
  if(ind.track.length>DEAD_TRACK_KEEP){
    const step=Math.ceil(ind.track.length/DEAD_TRACK_KEEP), thin=[];
    for(let i=0;i<ind.track.length;i+=step) thin.push(ind.track[i]);
    thin.push(ind.track[ind.track.length-1]);
    ind.track=thin;
  }
  addEv(w,ind,'death',cause);
  w.dead.push(ind);
  if(w.dead.length>TUNE.deadRegistryMax) w.dead.shift();
}
/* 사냥 기록. kills 는 '잡은 마릿수'다 — 무리에서 뜯어낸 몫도, 밀도장에서
   덜어낸 소형 먹이도 같은 단위로 쌓인다(그래서 소수점이 붙는다).
   개체군 동역학에는 쓰이지 않는 순수 기록값이다. */
export function noteKill(w,ind,n,preyName){
  if(!(n>0)) return;
  const was=ind.kills;
  ind.kills+=n;
  if(was<1&&ind.kills>=1) addEv(w,ind,'hunt',`첫 사냥 성공 — ${preyName}`);
}
/* 계보를 잇는다. 목록에는 상한을 둔다 — 수십 년 사는 개체가 남긴 수를
   전부 들고 있을 필요는 없고, 화면에도 그만큼은 못 띄운다. */
const KIN_MAX=40;
export function linkKin(w,mother,child,father){
  if(!child) return;
  for(const [p,key] of [[mother,'parent'],[father,'parent2']]){
    if(!p) continue;
    child[key]=p.uid;
    if(p.children.length<KIN_MAX) p.children.push(child.uid);
  }
}
/* 짝을 기록한다. 같은 상대와 여러 번 낳아도 한 번만 적는다. */
export function noteMate(w,a,b){
  for(const [x,y] of [[a,b],[b,a]]){
    if(x.mates.includes(y.uid)) continue;
    if(x.mates.length<KIN_MAX) x.mates.push(y.uid);
    addEv(w,x,'breed',`${y.name}와(과) 짝을 이룸`);
  }
}
export const indAge=(w,ind)=>((ind.deathDay??(w.year*365+w.day))-ind.bornDay)/365;
