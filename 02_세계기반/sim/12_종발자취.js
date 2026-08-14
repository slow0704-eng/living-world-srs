/* 섬 생태 시뮬레이터 — 종의 발자취 (마일스톤)
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다.

   개체에게 생애가 있다면 종에게는 발자취가 있다.
   "언제 가장 번성했고, 언제 반토막 났고, 언제 최소존속선 아래로 떨어졌다가
   어떻게 돌아왔는가" — 개체군 곡선을 눈으로 훑어야 알던 것을 사건으로 남긴다.

   해마다 한 번(연 마감) 판정한다. 날마다 보면 진동 한 번에 수십 건이 쌓여
   발자취가 아니라 잡음이 된다.

   [등급]
     주요  절멸 · 위기 · 회복 · 폭증 — 크로니클에도 남는다
     보통  최대 · 급감 · 최저
   등급을 나누는 이유는 300년을 돌린 뒤 "무슨 일이 있었나"를 물었을 때
   주요 사건만 먼저 읽을 수 있어야 하기 때문이다. */

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
};

function note(w,sp,kind,msg,n){
  sp.milestones.push({ year:w.year, kind, msg, n:Math.round(n) });
  if(SPEC_EVENTS[kind].major)
    logChron(w,'spec',`${sp.name}(${sp.trophic}) ${SPEC_EVENTS[kind].label} — ${msg}`);
}

/* 연 마감에서 부른다. 종마다 고점·저점과 상태 깃발을 들고 다니며
   경계를 넘는 순간만 적는다. */
export function trackSpecies(w){
  for(const sp of w.species){
    if(sp.kind!=='ANIMAL'||sp.aggregate||sp.status==='ABSENT') continue;
    if(!sp.milestones){
      sp.milestones=[]; sp.peakN=sp.n; sp.peakYear=w.year;
      sp.minN=sp.n; sp.minYear=w.year; sp.mark={};
      note(w,sp,'seed',`${Math.round(sp.n).toLocaleString('en-US')}마리로 시작`,sp.n);
    }
    const n=sp.n, m=sp.mark;

    if(sp.extinctYear!=null){
      if(!m.extinct){ m.extinct=true;
        note(w,sp,'extinct',`${sp.peakYear}년 최대 ${Math.round(sp.peakN).toLocaleString('en-US')}마리에서 사라짐`,0); }
      continue;
    }
    /* 최대 : 직전 고점을 1.5배 넘겼을 때만 적는다. 갱신마다 적으면
       상승 구간이 통째로 사건으로 채워진다. */
    if(n>sp.peakN){
      const prev=sp.peakN, prevYear=sp.peakYear;
      sp.peakN=n; sp.peakYear=w.year;
      if(prev>0&&n>prev*1.3)
        note(w,sp,'peak',`${Math.round(n).toLocaleString('en-US')}마리 — ${prevYear}년 최대의 ${(n/prev).toFixed(1)}배`,n);
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
  }
}

/* 결과 저장용. 종마다 발자취와 고점·저점을 간추린다. */
export function speciesTrail(sp){
  return { peakN:Math.round(sp.peakN||0), peakYear:sp.peakYear??null,
           minN:Math.round(sp.minN||0), minYear:sp.minYear??null,
           milestones:(sp.milestones||[]).map(e=>({...e})) };
}
