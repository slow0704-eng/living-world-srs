/* 섬 생태 시뮬레이터 — 명예의 전당 · 종별 레거시
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다.

   개체군 숫자만 보면 판이 어떻게 흘렀는지는 알아도 누가 살았는지는 모른다.
   여기서는 '가장 오래 산 놈 · 가장 많이 남긴 놈 · 가장 많이 잡은 놈'을
   종별로 뽑아 생애와 함께 남긴다.

   w.inds 는 한 번 만든 개체를 지우지 않는다(사망 명부 w.dead 만 상한이 있다).
   그래서 판 전체를 훑어야 기록이 사망 명부에서 밀려나도 살아남는다. */

import { indAge } from './06_개체.js';

/* 등급마다 자랑거리가 다르다. 무리 대표에게 사냥 수는 의미가 없고,
   포식자에게 무리 규모는 존재하지 않는다. */
export const HALL_CATS = [
  { key:'longest', lab:'최장수',   unit:'년',   fix:1, tiers:['T3','T4','T5'], val:(w,i)=>indAge(w,i) },
  { key:'breeder', lab:'최다번식', unit:'마리', fix:0, tiers:['T3','T4','T5'], val:(w,i)=>i.offspring },
  { key:'hunter',  lab:'최다사냥', unit:'마리', fix:0, tiers:['T4','T5'],      val:(w,i)=>i.kills },
  { key:'herd',    lab:'최대무리', unit:'마리', fix:0, tiers:['T3'],           val:(w,i)=>i.peakHerd },
];

/* 개체 한 마리를 기록용으로 굳힌다. 참조를 들고 있으면 되살아난 듯 값이
   변하므로, 뽑는 순간의 상태를 복사해 둔다. */
/* uid -> 개체. 계보를 이름으로 풀려면 필요하다. 저장할 때 한 번만 만든다. */
export function indexByUid(w){
  const m=new Map();
  for(const i of w.inds) m.set(i.uid,i);
  return m;
}
/* 형제는 저장하지 않는다 — 부모의 자식 목록에서 자기를 뺀 것이 형제다. */
function kinOf(w,i,byUid){
  if(!byUid) return null;
  const nameOf=u=>{ const k=byUid.get(u); return k?k.name:null; };
  const lists=[i.parent,i.parent2].map(u=>{ const p=byUid.get(u); return p?p.children:null; })
    .filter(Boolean);
  const full=new Set(), half=new Set();
  for(const kids of lists) for(const u of kids){
    if(u===i.uid) continue;
    if(lists.length===2&&lists.every(k=>k.includes(u))) full.add(u); else half.add(u);
  }
  for(const u of full) half.delete(u);
  return {
    parents:[i.parent,i.parent2].map(nameOf).filter(Boolean),
    mates:i.mates.map(nameOf).filter(Boolean).slice(0,8),
    siblings:{ full:full.size, half:half.size,
               names:[...full,...half].map(nameOf).filter(Boolean).slice(0,8) },
    children:i.children.map(nameOf).filter(Boolean).slice(0,8),
  };
}
export function indBrief(w,i,byUid){
  const kin=kinOf(w,i,byUid);
  return {
    ...(kin?{kin}:{}),
    uid:i.uid, name:i.name, sp:w.species[i.sp].name, trophic:w.species[i.sp].trophic,
    sex:i.sex, bornYear:+(i.bornDay/365).toFixed(1),
    deathYear:i.deathDay==null?null:+(i.deathDay/365).toFixed(1),
    ageYr:+indAge(w,i).toFixed(1), cause:i.cause, fate:i.deathDay==null?'alive':(i.fate||'death'),
    kills:+i.kills.toFixed(1), offspring:i.offspring, peakHerd:Math.round(i.peakHerd||0),
    events:i.ev.map(e=>[+(e[0]/365).toFixed(1),e[1],e[2]]),
  };
}

/* 종별 명예의 전당 + 레거시 집계.
   수명 통계는 fate==='death' 인 개체만 쓴다. '무리 흡수'는 죽음이 아니라
   대표 자리를 잃은 것이라, 섞으면 평균 수명이 무리 병합 주기로 내려앉는다. */
export function hallOfFame(w){
  const byUid=indexByUid(w);
  const bySp=new Map();
  for(const i of w.inds){
    const sp=w.species[i.sp];
    let g=bySp.get(sp.name);
    if(!g){ g={ name:sp.name, trophic:sp.trophic, massKg:+sp.massKg.toFixed(1),
                lifespanYr:+sp.lifespanYr.toFixed(1), tracked:0, alive:0, deaths:0, merges:0,
                lifeSum:0, causes:{}, records:[], _pick:{} };
            bySp.set(sp.name,g); }
    g.tracked++;
    const fate=i.deathDay==null?'alive':(i.fate||'death');
    if(fate==='alive') g.alive++;
    else if(fate==='merge') g.merges++;
    else { g.deaths++; g.lifeSum+=indAge(w,i); g.causes[i.cause]=(g.causes[i.cause]||0)+1; }
    for(const c of HALL_CATS){
      if(!c.tiers.includes(sp.trophic)) continue;
      const v=c.val(w,i);
      if(!(v>0)) continue;
      const cur=g._pick[c.key];
      if(!cur||v>cur.v) g._pick[c.key]={v,i};
    }
  }
  const out=[];
  for(const g of bySp.values()){
    g.meanLifeYr=g.deaths?+(g.lifeSum/g.deaths).toFixed(1):null;
    for(const c of HALL_CATS){
      const p=g._pick[c.key]; if(!p) continue;
      g.records.push({ key:c.key, lab:c.lab, unit:c.unit,
        value:+p.v.toFixed(c.fix), ind:indBrief(w,p.i,byUid) });
    }
    delete g._pick; delete g.lifeSum;
    out.push(g);
  }
  const rank={T2:0,T3:1,T4:2,T5:3};
  out.sort((a,b)=>(rank[a.trophic]-rank[b.trophic])||b.tracked-a.tracked);
  return out;
}
