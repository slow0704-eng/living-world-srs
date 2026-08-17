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
    /* 살아남은 것도 기록이다. 마릿수는 죽은 것만 세지만, 생애는
       "몇 번 죽을 뻔했고 몇 번 넘겼는가"로 읽힌다. */
    /* slot : 이 개체가 올라탄 초식 슬롯. 포식자는 슬롯이 없어 -1 로 남는다. */
    slot:-1,
    crises:0, escapes:0, lowE:false,      // 굶주림 위기 · 포식 모면
    /* descendants 는 지금까지 남긴 후손의 총수, descLive 는 그중 살아 있는 수다.
       둘을 나눠야 '혈통이 이어지는가'를 물어볼 수 있다 —
       후손을 백 남겼어도 다 죽었으면 그 줄은 끊긴 것이다.
       값은 여기서 세지 않는다. 볼 때 refreshLineage 가 자식 줄을 끝까지
       내려가며 채운다. */
    descendants:0, descLive:0, sawGrand:false, sawGreat:false,

    track:[[w.year*365+w.day,x,y]], ev:[] };
  addEv(w,ind,'birth','태어남');
  w.inds.push(ind);
  w.indByUid.set(ind.uid,ind);
  return ind;
}
/* ── 굶주림 위기와 그 극복 ──────────────────────────────────────────────
   문턱은 사인이 '아사'로 갈리는 선과 같다(deathEnergyMax x 0.5).
   내려갈 때는 적지 않고 되살아났을 때만 적는다 — 에너지가 문턱 근처에서
   떨면 생애가 같은 줄로 뒤덮이기 때문이다. 되살아난 기준을 넉넉히(0.5)
   두는 것도 같은 이유다. 문턱을 겨우 넘나드는 것은 극복이 아니다. */
const CRISIS_OUT=0.5;
export function noteCrisis(w,ind,e){
  if(e<TUNE.deathEnergyMax*0.5){ ind.lowE=true; return; }
  if(!ind.lowE||e<CRISIS_OUT) return;
  ind.lowE=false; ind.crises++;
  addEv(w,ind,'crisis',ind.crises===1?'굶어 죽기 직전에서 되살아남'
    :`굶주림을 또 넘김 (${ind.crises}번째)`);
}
/* ── 포식자를 만나고 살아남음 ────────────────────────────────────────────
   포식자가 표적으로 집었으나 잡는 데 실패한 순간이다. 추적 중인 개체만
   적는다. 행동은 바꾸지 않는다 — 이건 기록이지 기제가 아니다. */
export function noteEscape(w,ind,predName){
  if(!ind) return;
  ind.escapes++;
  addEv(w,ind,'escape',ind.escapes===1?`${predName}의 표적이 되었으나 벗어남`
    :`${predName}에게서 또 벗어남 (${ind.escapes}번째)`);
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
  w.lineEpoch=(w.lineEpoch||0)+1;   // 혈통 집계를 다시 세게 한다
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
   전부 들고 있을 필요는 없다.
   40 이었을 때 47 · 57 마리를 남긴 개체의 계보도가 잘려 보였다(8마리 해당).
   계보도가 이 목록을 그대로 따라 내려가므로, 잘리면 자손이 사라진 것처럼
   읽힌다. uid 하나가 8바이트라 120 으로 올려도 값이 싸다.
   후손 집계도 이 목록을 타고 내려가므로, 상한에 걸린 개체는 그 아래 줄이
   통째로 빠진다 — 자손 수(offspring)와 후손 수가 어긋나면 여기를 본다. */
const KIN_MAX=120;
export function linkKin(w,mother,child,father){
  if(!child) return;
  for(const [p,key] of [[mother,'parent'],[father,'parent2']]){
    if(!p) continue;
    child[key]=p.uid;
    if(p.children.length<KIN_MAX) p.children.push(child.uid);
  }
  w.lineEpoch=(w.lineEpoch||0)+1;
  noteLineage(w,child);
}
/* ── 손자를 봄 · 증손자를 봄 ─────────────────────────────────────────────
   후손 수는 볼 때 세지만(refreshLineage), '손자를 봤다'는 살아 있는 동안
   딱 한 번 일어나는 사건이라 그 순간에 적어야 한다. 태어날 때 조상 줄을
   3대까지만 거슬러 올라간다 — 그 위로는 붙일 사건이 없다. */
const EVENT_DEPTH=3;
function noteLineage(w,child){
  const byUid=w.indByUid;
  let front=[]; const seen=new Set();
  for(const u of [child.parent,child.parent2])
    if(u!=null&&!seen.has(u)){ seen.add(u); front.push(u); }
  for(let gen=1; gen<=EVENT_DEPTH&&front.length; gen++){
    const next=[];
    for(const u of front){
      const p=byUid.get(u); if(!p) continue;
      /* '봤다'는 사건은 살아 있을 때만 붙는다. 죽은 개체의 연표에 사망
         이후의 줄이 생기면 생애가 아니라 오류로 읽힌다. */
      const alive=p.deathDay==null;
      if(gen===2&&!p.sawGrand){ p.sawGrand=true; if(alive) addEv(w,p,'legacy','손자를 봄'); }
      if(gen===3&&!p.sawGreat){ p.sawGreat=true; if(alive) addEv(w,p,'legacy','증손자를 봄'); }
      for(const q of [p.parent,p.parent2])
        if(q!=null&&!seen.has(q)){ seen.add(q); next.push(q); }
    }
    front=next;
  }
}
/* ── 후손이 얼마나 번영했는가 ────────────────────────────────────────────
   자식 수(offspring)는 그 개체가 한 일이고, 후손 수(descendants)는 그 뒤에
   벌어진 일이다. 오래 산 개체보다 '자식이 또 자식을 남긴' 개체가 판에
   더 오래 남는다 — 그것이 번영이다.

   태어날 때 조상 줄을 거슬러 올라가며 세어 두던 것을 걷어냈다. 조상은
   세대마다 배로 늘어 깊이를 4대로 끊어야 했는데, 그러면 5대손부터는 세지
   않으므로 '부모가 자식보다 혈통이 적은' 줄이 생긴다 — 자식의 4대 아래는
   부모에게는 5대 아래라서다. 40년 판에서 부모-자식 쌍의 2.1%가 그렇게
   뒤집혀 있었고, 세대가 짧은 종일수록(기린 297 → 실측 1614) 크게 깎였다.
   판을 시작한 조상이 정렬 맨 위에 오지 않던 것도 같은 이유다.

   그래서 반대로 센다 — 볼 때 자식 줄을 끝까지 내려간다. 3만 마리 판에서
   전수 계산이 0.07초라, 미리 세어 둘 이유가 없다. 대신 사는 동안 매 출산마다
   조상 줄을 훑던 비용이 사라진다. */
export function refreshLineage(w){
  const epoch=w.lineEpoch||0;
  if(w._lineDone===epoch) return;
  w._lineDone=epoch;
  const byUid=w.indByUid, inds=w.inds;
  /* 방문 표식은 uid 로 찍는다. 뿌리마다 uid+1 로 도장을 바꾸므로 판을
     지울 필요가 없다 (Set 을 개체마다 새로 만들면 그게 더 비싸다). */
  const mark=new Int32Array(w.uid+1), stack=[];
  for(const root of inds){
    if(!root.children.length){ root.descendants=0; root.descLive=0; continue; }
    const tag=root.uid+1;
    let tot=0, live=0;
    for(const u of root.children) stack.push(u);
    while(stack.length){
      const u=stack.pop();
      if(mark[u]===tag) continue;     // 근친이면 같은 후손에 두 길로 닿는다
      mark[u]=tag;
      const c=byUid.get(u); if(!c) continue;
      tot++; if(c.deathDay==null) live++;
      for(const g of c.children) if(mark[g]!==tag) stack.push(g);
    }
    root.descendants=tot; root.descLive=live;
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
