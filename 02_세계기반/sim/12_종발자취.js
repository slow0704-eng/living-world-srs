/* 섬 생태 시뮬레이터 — 종의 발자취 (마일스톤)
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다.

   개체에게 생애가 있다면 종에게는 발자취가 있다.
   "언제 가장 번성했고, 언제 반토막 났고, 언제 최소존속선 아래로 떨어졌다가
   어떻게 돌아왔는가" — 개체군 곡선을 눈으로 훑어야 알던 것을 사건으로 남긴다.

   해마다 한 번(연 마감) 판정한다. 날마다 보면 진동 한 번에 수십 건이 쌓여
   발자취가 아니라 잡음이 된다.

   [등급]
     주요  절멸 · 위기 · 회복 · 폭증 · 급감 · 위축 · 피식 — 크로니클에도 남는다
     보통  정착 · 최대 · 최저 · 확산 · 밀집 · 고령 · 세대 · 감소 · 반등
   등급을 나누는 이유는 300년을 돌린 뒤 "무슨 일이 있었나"를 물었을 때
   주요 사건만 먼저 읽을 수 있어야 하기 때문이다.

   숫자 그 자체(개체수 · 출생 · 사망 · 피식 · 서식 셀 · 최대 군집 · 평균 나이)는
   해마다 yearly 에 그대로 쌓는다. 사건은 그 위에서 판정한 해석이고,
   yearly 는 해석 이전의 기록이다. */

import { ECO } from './01_사양상수.js';
import { logChron } from './09_통계이력.js';

/* 사건 종류. label 은 표시용, major 면 크로니클에도 남긴다. */
export const SPEC_EVENTS = {
  seed:    { label:'정착',  major:false },
  peak:    { label:'최대',  major:false },
  boom:    { label:'폭증',  major:true  },
  crash:   { label:'급감',  major:true  },
  trough:  { label:'최저',  major:false },
  brink:   { label:'위기',  major:true  },
  recover: { label:'회복',  major:true  },
  extinct: { label:'절멸',  major:true  },
  range:   { label:'확산',  major:false },
  shrink:  { label:'위축',  major:true  },
  crowd:   { label:'밀집',  major:false },
  aging:   { label:'고령',  major:false },
  young:   { label:'세대',  major:false },
  predation:{label:'피식',  major:true  },
  decline: { label:'감소',  major:false },
  rebound: { label:'반등',  major:false },
};

function note(w,sp,kind,msg,n){
  sp.milestones.push({ year:w.year, kind, msg, n:Math.round(n) });
  if(SPEC_EVENTS[kind].major)
    logChron(w,'spec',`${sp.name}(${sp.trophic}) ${SPEC_EVENTS[kind].label} — ${msg}`);
}

/* 그 해 그 종의 분포를 잰다. T3는 밀도장에서, 포식자는 개체 목록에서.
   연 한 번만 부르므로 셀을 통째로 훑어도 싸다. */
function spread(w,sp){
  let cells=0, maxClump=0;
  if(sp.trophic==='T3'&&sp._t3!=null){
    const N=w.g.N, o=sp._t3*N, d=w.densPrev;
    for(let j=0;j<N;j++){ const v=d[o+j]; if(v>0){ cells++; if(v>maxClump) maxClump=v; } }
  } else if(sp.trophic==='T4'||sp.trophic==='T5'){
    const at=new Map();
    for(const p of (sp.trophic==='T4'?w.p4:w.p5)){
      if(p.sp!==sp.id) continue;
      const ci=w.g.idx(p.x|0,p.y|0);
      const v=(at.get(ci)||0)+1; at.set(ci,v);
      if(v>maxClump) maxClump=v;
    }
    cells=at.size;
  }
  return {cells,maxClump:Math.round(maxClump)};
}

/* 연 마감에서 부른다. 종마다 고점·저점과 상태 깃발을 들고 다니며
   경계를 넘는 순간만 적는다. 해마다의 숫자는 yearly 에 그대로 쌓는다. */
export function trackSpecies(w){
  const landCells=Math.max(w.landCount,1);
  for(const sp of w.species){
    if(sp.kind!=='ANIMAL'||sp.aggregate||sp.status==='ABSENT') continue;
    if(!sp.milestones){
      sp.milestones=[]; sp.yearly=[]; sp.peakN=sp.n; sp.peakYear=w.year;
      sp.minN=sp.n; sp.minYear=w.year; sp.peakCells=0; sp.peakClump=0; sp.mark={}; sp.run=0;
      note(w,sp,'seed',`${Math.round(sp.n).toLocaleString('en-US')}마리로 시작`,sp.n);
    }
    const n=sp.n, m=sp.mark;
    const {cells,maxClump}=spread(w,sp);
    const meanAge=sp.ageN?sp.ageSum/sp.ageN:0;
    const born=sp.bornYr, died=sp.diedYr, eaten=sp.eatenYr;
    const starved=sp.starvedYr, thirst=sp.thirstYr, aged=sp.agedYr;
    const prev=sp.yearly.length?sp.yearly[sp.yearly.length-1].n:n;
    /* 그 해의 숫자를 그대로 남긴다. 사건은 이 위에서 판정한다. */
    sp.yearly.push({ year:w.year, n:Math.round(n), born, died, eaten,
      starved, thirst, aged,
      cells, maxClump, meanAge:+meanAge.toFixed(1),
      rangePct:+(cells/landCells*100).toFixed(1) });
    sp.bornYr=0; sp.diedYr=0; sp.eatenYr=0;
    sp.starvedYr=0; sp.thirstYr=0; sp.agedYr=0; sp.ageSum=0; sp.ageN=0;

    if(sp.extinctYear!=null){
      if(!m.extinct){ m.extinct=true;
        note(w,sp,'extinct',`${sp.peakYear}년 최대 ${Math.round(sp.peakN).toLocaleString('en-US')}마리에서 사라짐`,0); }
      continue;
    }
    /* 최대 : 직전 고점을 1.3배 넘겼을 때만 적는다. 갱신마다 적으면
       상승 구간이 통째로 사건으로 채워진다. */
    if(n>sp.peakN){
      const was=sp.peakN, wasYear=sp.peakYear;
      sp.peakN=n; sp.peakYear=w.year;
      if(was>0&&n>was*1.3)
        note(w,sp,'peak',`${Math.round(n).toLocaleString('en-US')}마리 — ${wasYear}년 최대의 ${(n/was).toFixed(1)}배`,n);
      /* 폭증 : 유도 배분(seedN)의 3배를 처음 넘긴 해 */
      if(!m.boom&&sp.seedN>0&&n>=sp.seedN*3){ m.boom=true;
        note(w,sp,'boom',`유도 배분 ${sp.seedN.toLocaleString('en-US')}의 ${(n/sp.seedN).toFixed(1)}배`,n); }
    }
    if(n<sp.minN){ sp.minN=n; sp.minYear=w.year;
      if(!m.trough&&sp.peakN>0&&n<sp.peakN*0.1)
        { m.trough=true; note(w,sp,'trough',`고점의 ${(n/sp.peakN*100).toFixed(0)}%까지 내려감`,n); }
    }
    /* 급감 : 고점의 절반 아래로 떨어진 해. 회복하면 다시 셀 수 있게 깃발을 내린다 */
    if(sp.peakN>0&&n<=sp.peakN*0.5){
      if(!m.crash){ m.crash=true;
        note(w,sp,'crash',`${sp.peakYear}년 ${Math.round(sp.peakN).toLocaleString('en-US')}마리에서 ${Math.round(n).toLocaleString('en-US')}마리로`,n); }
    } else if(n>sp.peakN*0.8) m.crash=false;

    /* 위기와 회복 : [I-6.1] 최소존속개체군 기준 */
    if(n<ECO.mvpShort){
      if(!m.brink){ m.brink=true;
        note(w,sp,'brink',`최소존속선(${ECO.mvpShort}) 아래 — ${Math.round(n).toLocaleString('en-US')}마리`,n); }
    } else if(m.brink&&n>=ECO.mvpLong){ m.brink=false;
      note(w,sp,'recover',`장기존속선(${ECO.mvpLong}) 회복 — ${Math.round(n).toLocaleString('en-US')}마리`,n);
    }

    /* ── 여기서부터는 '얼마나'가 아니라 '어떻게'를 적는다 ── */

    // 분포 : 얼마나 넓게 퍼졌는가. 개체 수가 같아도 흩어졌는지 몰렸는지가 다르다
    if(cells>sp.peakCells*1.3&&sp.peakCells>0)
      note(w,sp,'range',`서식 ${cells}셀 — 육지의 ${(cells/landCells*100).toFixed(0)}%로 퍼짐`,n);
    else if(sp.peakCells>0&&cells>0&&cells<sp.peakCells*0.4&&!m.shrink){
      m.shrink=true;
      note(w,sp,'shrink',`서식 ${cells}셀 — 최대 ${sp.peakCells}셀의 ${(cells/sp.peakCells*100).toFixed(0)}%로 좁아짐`,n);
    }
    if(cells>sp.peakCells) sp.peakCells=cells;
    if(cells>sp.peakCells*0.8) m.shrink=false;

    // 군집 : 한자리에 얼마나 모였는가
    if(maxClump>sp.peakClump*1.5&&sp.peakClump>=20)
      note(w,sp,'crowd',`한자리에 ${maxClump}마리가 모임 (이전 최대 ${sp.peakClump})`,n);
    if(maxClump>sp.peakClump) sp.peakClump=maxClump;

    // 인구 구조 : 늙어가는가 젊어지는가
    if(sp.lifespanYr>0){
      const r=meanAge/sp.lifespanYr;
      if(!m.old&&r>0.5){ m.old=true;
        note(w,sp,'aging',`평균 나이 ${meanAge.toFixed(1)}년 — 수명의 ${(r*100).toFixed(0)}%, 늙은 개체군`,n); }
      else if(m.old&&r<0.35){ m.old=false;
        note(w,sp,'young',`평균 나이 ${meanAge.toFixed(1)}년 — 세대가 갈렸다`,n); }
    }

    // 포식압 : 그 해 죽음 중 잡아먹힌 몫
    const lost=died+eaten;
    if(lost>0&&n>0){
      const pr=eaten/Math.max(n,1);
      if(!m.hunted&&pr>=0.25){ m.hunted=true;
        note(w,sp,'predation',`한 해에 개체의 ${(pr*100).toFixed(0)}%가 잡아먹힘 (${eaten.toLocaleString('en-US')}마리)`,n); }
      else if(m.hunted&&pr<0.1) m.hunted=false;
    }

    // 흐름 : 몇 해째 줄고 있는가 늘고 있는가
    const dir=n>prev*1.02?1:n<prev*0.98?-1:0;
    sp.run=(dir!==0&&Math.sign(sp.run)===dir)?sp.run+dir:dir;
    if(sp.run===-3) note(w,sp,'decline',`3년째 줄고 있다 — ${Math.round(n).toLocaleString('en-US')}마리`,n);
    if(sp.run===3) note(w,sp,'rebound',`3년째 늘고 있다 — ${Math.round(n).toLocaleString('en-US')}마리`,n);
  }
}

/* 결과 저장용. 종마다 발자취와 고점·저점을 간추린다. */
export function speciesTrail(sp){
  return { peakN:Math.round(sp.peakN||0), peakYear:sp.peakYear??null,
           minN:Math.round(sp.minN||0), minYear:sp.minYear??null,
           peakCells:sp.peakCells||0, peakClump:sp.peakClump||0,
           milestones:(sp.milestones||[]).map(e=>({...e})),
           yearly:(sp.yearly||[]).map(e=>({...e})) };
}
