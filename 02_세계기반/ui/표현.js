/* 섬 생태 시뮬레이터 — 표현 계층 — DOM은 여기서만 만진다
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다. */

import { CLIMATE_PROFILES, ISLAND_TIERS, ECO, TUNE, clamp, lerp, mulberry32,
         createWorld, stepDay, collectStats, viability, indAge,
         deriveCapacity, buildRoster,
         hallOfFame, indBrief, indexByUid, buildReport, speciesTrail, SPEC_EVENTS, attachInd,
         refreshLineage, REGION_NAMES, regionOf, homeRegion,
         logChron, chronDirty, setChronDirty } from '../sim/index.js';


export function boot(){
const $=id=>document.getElementById(id);
const fmt=n=>Math.round(n).toLocaleString('ko-KR');
const varCache={};
const cssVar=n=>varCache[n]??=getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const TIER_VAR={T0:'--t0',T1:'--t1',T2:'--t2',T3:'--t3',T4:'--t4',T5:'--t5'};
/* 종별 색. 등급마다 색조 띠를 정해 두고 그 안에서 종을 가른다 —
   띠를 지키면 '무슨 등급인가'가 여전히 한눈에 읽히고, 띠 안의 차이로
   '어느 종인가'가 갈린다. 색을 통째로 흩으면 등급 구분이 사라진다. */
const TIER_HUE={T2:[188,224], T3:[248,288], T4:[14,52], T5:[318,356]};
/* 색만으로는 종이 안 갈린다. 지도 위의 점은 2~4px 라 색상 차이가 바탕에
   묻히고, 색약이면 아예 같은 점이 된다. 그래서 두 번째 채널을 붙인다.
     T2 밀도장 : 가로 막대 · 세로 막대 · 정사각 — 결이 다르게 보인다
     개체(T3~T5) : 동그라미 · 네모 · 세모 · 마름모 · 십자
   범례와 종 목록에는 지도와 '같은 표식'을 그린다 — 다른 기호를 쓰면
   범례를 봐도 지도에서 못 찾는다. */
const MARKS=['circle','square','triangle','diamond','cross'];
const T2BARS=[[3.2,1],[1,3.2],[1.9,1.9],[3.2,3.2]];   // [가로, 세로] 비율
let dotMode='tier', speciesDot=[], speciesMark=[];
function buildSpeciesColors(w){
  speciesDot=[]; speciesMark=[];
  for(const t of ['T2','T3','T4','T5']){
    const ids=w.byTier[t].filter(id=>w.species[id].status!=='ABSENT');
    const [lo,hi]=TIER_HUE[t];
    ids.forEach((id,k)=>{
      const h=ids.length===1?(lo+hi)/2:lo+(hi-lo)*(k+0.5)/ids.length;
      speciesDot[id]=`hsl(${h.toFixed(0)} 70% 52%)`;
      speciesMark[id]=t==='T2'?T2BARS[k%T2BARS.length]:MARKS[k%MARKS.length];
    });
  }
  /* 분해자와 시뮬 식물도 색을 갖는다 — 레이어(분해자 · 우세 식물)와 종 목록이
     같은 색을 써야 "지도의 저 색이 무슨 종인가"를 표에서 찾을 수 있다. */
  const rgbCss=c=>`rgb(${c[0]} ${c[1]} ${c[2]})`;
  w.byTier.T1.forEach((id,k)=>{
    speciesDot[id]=rgbCss(HUES[k%HUES.length]); speciesMark[id]='square'; });
  w.simPlants.forEach((id,k)=>{
    speciesDot[id]=rgbCss(HUES[(k+1)%HUES.length]); speciesMark[id]='triangle'; });
}
const dotColor=(w,id,tierVar)=>dotMode==='species'&&speciesDot[id]?speciesDot[id]:cssVar(tierVar);
/* 표식 하나를 경로로 그린다. 채우기 · 테두리는 부르는 쪽이 정한다. */
function markPath(kind,x,y,r){
  ctx.beginPath();
  switch(kind){
    case 'square':   ctx.rect(x-r,y-r,r*2,r*2); break;
    case 'triangle': ctx.moveTo(x,y-r*1.3); ctx.lineTo(x+r*1.2,y+r*0.95);
                     ctx.lineTo(x-r*1.2,y+r*0.95); ctx.closePath(); break;
    case 'diamond':  ctx.moveTo(x,y-r*1.4); ctx.lineTo(x+r*1.4,y);
                     ctx.lineTo(x,y+r*1.4); ctx.lineTo(x-r*1.4,y); ctx.closePath(); break;
    case 'cross':    ctx.rect(x-r*1.5,y-r*0.42,r*3,r*0.84);
                     ctx.rect(x-r*0.42,y-r*1.5,r*0.84,r*3); break;
    default:         ctx.arc(x,y,r,0,6.2832);
  }
}
/* 범례 · 표에 넣을 표식. 지도와 같은 모양을 그대로 그린다. */
function markSvg(id){
  const c=speciesDot[id], m=speciesMark[id];
  if(!c) return '';
  const S=13, h=S/2;
  const body=Array.isArray(m)
    ? `<rect x="${(S-m[0]*2.6)/2}" y="${(S-m[1]*2.6)/2}" width="${m[0]*2.6}" height="${m[1]*2.6}" fill="${c}"/>`
    : m==='square'   ? `<rect x="2.5" y="2.5" width="8" height="8" fill="${c}"/>`
    : m==='triangle' ? `<polygon points="${h},1.5 12,11 1,11" fill="${c}"/>`
    : m==='diamond'  ? `<polygon points="${h},1 12,${h} ${h},12 1,${h}" fill="${c}"/>`
    : m==='cross'    ? `<rect x="1" y="5" width="11" height="3" fill="${c}"/>`
                       +`<rect x="5" y="1" width="3" height="11" fill="${c}"/>`
    : `<circle cx="${h}" cy="${h}" r="4.6" fill="${c}"/>`;
  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" style="flex:0 0 auto;vertical-align:-2px">${body}</svg>`;
}

const GA=[{id:'year',lab:'경과',unit:'년',get:s=>s.year},{id:'day',lab:'일차',get:s=>s.day+1},
  {id:'season',lab:'계절',txt:true,get:s=>s.wet?'우기':'건기'},
  {id:'temp',lab:'기온',unit:'°C',get:s=>s.tempC.toFixed(1)},
  {id:'rain',lab:'당일 강수',unit:'mm',get:s=>s.rainMm.toFixed(1)},
  {id:'soil',lab:'토양수분',unit:'mm',get:s=>Math.round(s.soilMm)},
  {id:'wcell',lab:'가용 수원',unit:'셀',get:s=>fmt(s.waterCells)}];
const GB=[{id:'grass',lab:'초본 현존량',unit:'천t',get:s=>fmt(s.grassT/1000)},
  {id:'gfill',lab:'초본 충전율',unit:'%',get:s=>(s.grassFill*100).toFixed(0)},
  {id:'woody',lab:'목본 임관',unit:'%',get:s=>Math.round(s.woodyFrac*100)},
  {id:'fire',lab:'연소 중',unit:'셀',get:s=>s.burning},
  {id:'clump',lab:'군집 셀',get:s=>fmt(s.clumpCells)},
  {id:'big',lab:'최대 군집',get:s=>fmt(s.biggestClump)},
  {id:'energy',lab:'T3 에너지',get:s=>s.energy.toFixed(2)},
  {id:'inds',lab:'추적 개체',get:s=>fmt(s.inds)}];
const POP=[{k:'n1',cap:'T1',lab:'T1 분해자'},{k:'n2',cap:'T2',lab:'T2 소형초식'},{k:'n3',cap:'T3',lab:'T3 대형초식'},
  {k:'n4',cap:'T4',lab:'T4 소형육식'},{k:'n5',cap:'T5',lab:'T5 대형육식'}];
const build=(host,defs)=>host.innerHTML=defs.map(d=>
  `<div class="gauge"><div class="lab">${d.lab}</div><div class="val${d.txt?' txt':''}" id="g-${d.id}">–${d.unit?`<span class="u">${d.unit}</span>`:''}</div></div>`).join('');
build($('gaugesA'),GA); build($('gaugesB'),GB);
$('gaugesPop').innerHTML=POP.map(t=>
  `<div class="pop"><div class="lab">${t.lab}</div><div class="val sm" id="g-${t.k}">–</div>
   <div class="bar" style="color:var(${TIER_VAR[t.cap]})"><i id="b-${t.k}"></i></div></div>`).join('');

const LAYERS={
  veg:{lab:'식생',rgb(w,i,o){
    const wf=w.woody[i]/w.woodyCap;
    const t=clamp(w.grass[i]/Math.max(w.gcap[i]*(1-TUNE.woodySuppression*wf),0.5),0,1);
    o[0]=lerp(201,78,t);o[1]=lerp(180,124,t);o[2]=lerp(122,46,t);
    o[0]=lerp(o[0],58,wf*0.5);o[1]=lerp(o[1],72,wf*0.5);o[2]=lerp(o[2],40,wf*0.5);
    const b=w.burn[i];
    if(b>=0&&b<150){const a=(1-b/150)*0.72;o[0]=lerp(o[0],52,a);o[1]=lerp(o[1],45,a);o[2]=lerp(o[2],38,a);}}},
  water:{lab:'토양수분',rgb(w,i,o){const t=clamp(w.soil[i]/110,0,1);
    o[0]=lerp(198,42,t);o[1]=lerp(180,114,t);o[2]=lerp(146,133,t);}},
  fear:{lab:'공포장',rgb(w,i,o){const t=clamp(w.fear[i],0,1);
    o[0]=lerp(232,158,t);o[1]=lerp(228,18,t);o[2]=lerp(214,48,t);}},
  burn:{lab:'화재이력',rgb(w,i,o){const t=w.burn[i]<0?0:clamp(1-w.burn[i]/365,0,1);
    o[0]=lerp(226,232,t);o[1]=lerp(224,98,t);o[2]=lerp(210,42,t);}},
  /* 분해자 밀도장. 종별로 최적 수분이 달라 젖은 자리와 마른 자리의 우세종이
     갈린다 — 어느 종이 우세한가를 색조로, 얼마나 많은가를 진하기로 보여준다. */
  t1:{lab:'분해자',rgb(w,i,o){
    const N=w.g.N, ids=w.byTier.T1;
    let tot=0,best=0,bv=-1;
    for(let k=0;k<ids.length;k++){ const v=w.t1d[k*N+i]; tot+=v; if(v>bv){bv=v;best=k;} }
    const t=clamp(tot/w.t1Ref,0,1);
    const c=t1Hue(best,ids.length);
    o[0]=lerp(232,c[0],t); o[1]=lerp(228,c[1],t); o[2]=lerp(214,c[2],t);}},
  /* 우세 식물. 같은 기능군 안에서 어느 종이 이겼는가를 칸마다 칠한다. */
  domplant:{lab:'우세 식물',rgb(w,i,o){
    const N=w.g.N; let best=-1,bv=-1;
    for(let k=0;k<w.pm.n;k++){
      const v=w.plantB[k*N+i]/Math.max(w.plantCap[k*N+i],1e-6);
      if(v>bv){bv=v;best=k;} }
    const c=plantHue(best,w.pm.n), t=clamp(bv,0,1);
    o[0]=lerp(236,c[0],t); o[1]=lerp(234,c[1],t); o[2]=lerp(222,c[2],t);}},
};
/* 레이어용 색조. 지도 위 색이라 채도를 낮게 잡는다. */
const HUES=[[196,120,54],[70,132,196],[196,86,132],[112,168,72],[168,120,196]];
const t1Hue=(k,n)=>HUES[k%HUES.length];
const plantHue=(k,n)=>HUES[(k+1)%HUES.length];
let layer='veg';
$('layerSeg').innerHTML=Object.entries(LAYERS).map(([k,v],n)=>
  `<button data-layer="${k}"${n===0?' aria-pressed="true"':''}>${v.lab}</button>`).join('');
/* 점이 무엇을 뜻하는지가 등급마다 다르다. 적어 두지 않으면
   "수십만 마리인데 점은 수백 개"로 읽혀 오해가 생긴다.
   T2 는 밀도장이라 한 점이 몇 마리인지를 정해야 하는데, 고정값으로 두면
   개체군이 백 배씩 오르내리는 동안 점이 사라지거나 셀을 덮어 버린다.
   그래서 지금 밀도에 맞춰 잡고, 그 값을 범례에 그대로 적는다. */
/* 하루 사이를 프레임으로 나눠 잇는다. 상태 갱신은 여전히 하루 한 번이고
   (물리 최소 단위 = 1일), 이것은 그 사이를 잇는 그림일 뿐이다.
   하루에 두 걸음 이상 나가는 속도에서는 보간이 뜻을 잃으므로 끈다. */
let dayFrac=1;
const IX=o=>o.px==null?o.x:o.px+(o.x-o.px)*dayFrac;
const IY=o=>o.py==null?o.y:o.py+(o.y-o.py)*dayFrac;
/* 슬롯판 보간. 초식은 객체가 아니라 형식화 배열의 첨자다. */
const AIX=(A,i)=>A.px[i]+(A.x[i]-A.px[i])*dayFrac;
const AIY=(A,i)=>A.py[i]+(A.y[i]-A.py[i])*dayFrac;
/* 대형 초식은 개체다. 점 하나가 한 마리이고 그 좌표는 진짜다.
   다만 수만 마리를 다 찍으면 화면이 뭉개지므로 넓게 볼 때는 솎는다. */
const SCATTER_BUDGET=6000;
let scatterNote='';
const NICE=[1,2,5,10,25,50,100,250,500,1000,2500,5000,10000];
const niceStep=v=>{let o=NICE[0];for(const n of NICE) if(n<=v) o=n; return o;};
let t2PerDot=200, scatterShown='';
/* 등고선 상태. 범례가 간격을 적으므로 drawLegend 보다 먼저 서 있어야 한다. */
let contours=null, contourStepM=0, showContour=true, showRegion=false;
function drawLegend(){
  /* 종별색이면 종을 하나씩 적는다 — 색만 바뀌고 범례가 등급 그대로면
     "저 색이 뭔가"를 물어볼 데가 없다. */
  const bySpec = dotMode==='species'&&W ? ['T2','T3','T4','T5'].map(t=>
      (W.byTier[t]||[]).filter(id=>W.species[id].status!=='ABSENT').map(id=>
        `<div class="lg">${markSvg(id)}<span>${t} ${W.species[id].name}</span></div>`
      ).join('')).join('') : '';
  $('legend').innerHTML=`<div class="lg"><span class="ramp"></span><span>초본 0 → 부양력</span></div>`
  +(bySpec || (`<div class="lg"><span class="sw" style="background:var(--t2)"></span>T2 점 1개 = ${fmt(t2PerDot)}마리 · 밀도장(개체 아님)</div>`
  +`<div class="lg"><span class="sw" style="background:var(--t3)"></span>${scatterShown||'T3 점 1개 = 개체 하나'}
     <span style="color:var(--ink-3)">— 무리는 객체가 아니라 모인 결과입니다</span></div>`
  +`<div class="lg"><span class="sw" style="background:var(--t4)"></span>T4 점 1개 = 개체 하나</div>`
  +`<div class="lg"><span class="sw" style="background:var(--t5)"></span>T5 점 1개 = 개체 하나</div>`))
  +(dotMode==='species'?`<div class="lg" style="color:var(--ink-3)">T2 점 1개 = ${fmt(t2PerDot)}마리 · 나머지는 점 1개 = 개체 하나</div>`:'')
  +`<div class="lg"><span class="sw" style="background:var(--water);border-radius:1px"></span>수원
    <span class="sw" style="background:var(--fire);border-radius:1px;margin-left:6px"></span>화재</div>`
  +(contourStepM?`<div class="lg"><span style="width:13px;flex:0 0 auto;border-top:1.5px solid rgba(38,30,16,.8)"></span>
    등고선 ${contourStepM}m 간격 · 굵은 선 ${contourStepM*5}m마다 · 2.5×부터 고도 표시(4×부터 전부)</div>`:'')
  +`<div class="lg" style="color:var(--ink-3)">축척 막대는 오른쪽 아래 — 배율을 바꾸면 함께 바뀝니다</div>
   <div class="lg" style="color:var(--ink-3)">휠 확대 · 끌어 이동 · 더블클릭 초기화</div>
   <div class="lg" style="color:var(--ink-3)">선택 개체는 흰 테두리와 동선으로 표시</div>`;
}
drawLegend();
$('selTier').innerHTML=Object.entries(ISLAND_TIERS).map(([k,v])=>
  `<option value="${k}"${k==='L'?' selected':''}>${v.name} · ${v.areaKm2.toLocaleString('ko-KR')}km²</option>`).join('');
$('selClimate').innerHTML=Object.entries(CLIMATE_PROFILES).map(([k,v])=>
  `<option value="${k}"${k==='SAVANNA'?' selected':''}>${v.name}</option>`).join('');

const cv=$('map'), ctx=cv.getContext('2d',{alpha:false});
const off=document.createElement('canvas'); let octx,img,W=null;
let selUid=null, specTier='ALL', indLive='all', indQuery='';
let indSex='all', indLine='all', indSpec='ALL';

function newWorld(seed,tier,climate,opts){
  W=createWorld(seed,tier,climate,opts||{});
  off.width=W.g.W; off.height=W.g.H;
  octx=off.getContext('2d'); img=octx.createImageData(W.g.W,W.g.H);
  cv.width=cv.height=Math.min(900,W.g.W*9);
  buildContours(W);                      // 고도는 변하지 않는다 — 여기서 한 번만
  buildSpeciesColors(W);
  chronDirty=true; selUid=null; zoom=1; vx=vy=0; zoomMeta(); drawLegend();
  $('brandSub').textContent=`${W.T.name} ${W.T.areaKm2.toLocaleString('ko-KR')}km² · ${W.C.name} · 격자 ${W.T.cellM}m`;
  $('mapMeta').textContent=`${W.g.W}×${W.g.H} 셀 · 육지 ${fmt(W.landCount)}`;
  const c=W.cap;
  $('histMeta').textContent=`유도 부양력 T1 ${fmt(c.T1)} · T2 ${fmt(c.T2)} · T3 ${fmt(c.T3)}`
    +` · T4 ${fmt(c.T4)} · T5 ${fmt(c.T5)}`;
  const ab=W.species.filter(s=>s.status==='ABSENT').length;
  $('specMeta').textContent=`[I-6.4] 계획 ${W.totalPlanned}종 · 결번 ${ab}종 · 식물 시뮬 ${W.simPlants.length}종`;
  $('specFilter').innerHTML=['ALL','T0','T2','T3','T4','T5'].map((t,i)=>
    `<button data-st="${t}"${i===0?' aria-pressed="true"':''}>${t==='ALL'?'전체':t}</button>`).join('');
  /* 종 필터는 세계마다 종이 달라지므로 여기서 다시 짠다. 개체를 갖는 것은
     T3 · T4 · T5 뿐이라 그 셋만 올린다. */
  indSex='all'; indLine='all'; indSpec='ALL';
  $('indSpec').innerHTML='<button data-spec="ALL" aria-pressed="true">모든 종</button>'
    +['T3','T4','T5'].flatMap(t=>W.byTier[t].filter(id=>W.species[id].status!=='ABSENT')
        .map(id=>`<button data-spec="${id}">${markSvg(id)} ${W.species[id].name}</button>`)).join('');
  for(const h of ['indFilter','indSex','indLine'])
    $(h).querySelectorAll('button').forEach((o,k)=>o.setAttribute('aria-pressed',k===0));
  specTier='ALL'; drawSpec(); drawInd(); drawLife();
  fitMap();
}
/* 시야 : 좌상단 셀 좌표(vx,vy)와 배율. 배율 1이면 섬 전체가 들어온다.
   확대해야 무리 하나하나, 포식자 한 마리가 구분된다. */
let zoom=1, vx=0, vy=0;
const visCells=()=>W.g.W/zoom;
function clampView(){
  const v=visCells();
  vx=clamp(vx,0,Math.max(0,W.g.W-v)); vy=clamp(vy,0,Math.max(0,W.g.H-v));
}
function setZoom(z,ax,ay){                 // ax,ay : 화면에서 고정할 셀 좌표
  const v0=visCells(); const z0=zoom;
  zoom=clamp(z,1,24);
  if(ax==null){ ax=vx+v0/2; ay=vy+v0/2; }
  const f=z0/zoom;
  vx=ax-(ax-vx)*f; vy=ay-(ay-vy)*f;
  clampView(); zoomMeta();
}
function zoomMeta(){
  const el=$('zoomMeta'); if(!el||!W) return;
  const mPerPx=W.T.cellM*visCells()/cv.width;
  el.textContent=`${zoom.toFixed(1)}× · 화면폭 ${(visCells()*W.cellKm).toFixed(1)}km · 1px ≈ ${mPerPx.toFixed(0)}m`;
}
/* 개체 추적 : 고른 개체를 화면 가운데에 붙잡아 둔다.
   느린 속도(0.1~0.5일/프레임)와 같이 쓰면 하루하루 움직임이 보인다. */
let follow=false;
function setFollow(on){
  follow=on;
  const b=$('btnFollow');
  b.setAttribute('aria-pressed',on); b.textContent=on?'추적 중':'개체 추적';
}
function followSel(){
  const i=findInd(selUid);
  if(!i||i.deathDay!=null){ setFollow(false); return; }
  const zoomed=zoom<6;
  if(zoomed) zoom=6;
  const v=visCells();
  vx=IX(i)-v/2; vy=IY(i)-v/2; clampView();
  if(zoomed) zoomMeta();
}
/* ── 등고선 ────────────────────────────────────────────────────────────
   고도는 세계 생성에서 한 번 정해지고 그 뒤로 변하지 않는다. 그래서
   마칭 스퀘어는 세계를 세울 때 한 번만 돌리고, 프레임마다는 이미 만든
   Path2D 에 시야 변환만 걸어 그린다 — 확대해도 비용이 늘지 않는다.

   격자점은 셀 중심이고, 바다는 0m 로 둔다. 그래야 가장 낮은 등고선이
   해안을 따라 닫히고 섬의 윤곽이 함께 읽힌다. */
const CONTOUR_STEPS=[10,20,25,50,100,200,250,500,1000];
/* 마칭 스퀘어 표. 변은 0=위 1=오른 2=아래 3=왼, 꼭짓점은 좌상부터 시계방향.
   5와 10은 안장이라 표에 담기지 않는다 — 가운데 값으로 따로 푼다. */
const MS_EDGES=[null,[0,3],[0,1],[1,3],[1,2],null,[0,2],[2,3],
                [2,3],[0,2],null,[1,2],[1,3],[0,1],[0,3],null];
function buildContours(w){
  contours=null;
  const g=w.g, e=w.elev, land=w.land, maxE=w.T.maxElevM;
  let step=CONTOUR_STEPS[CONTOUR_STEPS.length-1];
  for(const n of CONTOUR_STEPS) if(maxE/n<=10){ step=n; break; }
  contourStepM=step;
  const out=[], ex=[0,0,0,0], ey=[0,0,0,0];
  for(let lv=step,li=1; lv<maxE; lv+=step,li++){
    const p=new Path2D(), pts=[]; let segN=0;
    for(let y=0;y<g.H-1;y++)for(let x=0;x<g.W-1;x++){
      const i0=g.idx(x,y), i1=i0+1, i3=i0+g.W, i2=i3+1;
      const v0=land[i0]?e[i0]:0, v1=land[i1]?e[i1]:0,
            v2=land[i2]?e[i2]:0, v3=land[i3]?e[i3]:0;
      const m=(v0>=lv?1:0)|(v1>=lv?2:0)|(v2>=lv?4:0)|(v3>=lv?8:0);
      if(m===0||m===15) continue;
      const X=x+0.5, Y=y+0.5;
      /* 변마다 교점을 선형 보간으로 잡는다. 건너지 않는 변의 값은 쓰이지 않는다. */
      ex[0]=X+(lv-v0)/(v1-v0); ey[0]=Y;
      ex[1]=X+1;               ey[1]=Y+(lv-v1)/(v2-v1);
      ex[2]=X+(lv-v3)/(v2-v3); ey[2]=Y+1;
      ex[3]=X;                 ey[3]=Y+(lv-v0)/(v3-v0);
      /* 안장 : 가운데가 높으면 낮은 두 귀퉁이가 따로 잘리고, 낮으면 그 반대다 */
      const pair=(m===5||m===10)
        ? (((m===5)===((v0+v1+v2+v3)/4>=lv)) ? [0,1,2,3] : [0,3,1,2])
        : MS_EDGES[m];
      for(let k=0;k<pair.length;k+=2){
        const a=pair[k], b=pair[k+1];
        p.moveTo(ex[a],ey[a]); p.lineTo(ex[b],ey[b]);
        if((segN++%40)===0) pts.push((ex[a]+ex[b])/2,(ey[a]+ey[b])/2);
      }
    }
    if(segN) out.push({lv, major:li%5===0, path:p, pts});
  }
  contours=out.length?out:null;
}
/* 시야 변환을 걸어 한 번에 긋는다. 선 굵기는 배율로 나눠 화면에서 일정하게 둔다. */
function drawContours(s){
  if(!contours) return;
  ctx.save();
  ctx.setTransform(s,0,0,s,-vx*s,-vy*s);
  ctx.lineJoin='round'; ctx.lineCap='round';
  for(const c of contours){
    ctx.strokeStyle=c.major?'rgba(38,30,16,.78)':'rgba(38,30,16,.38)';
    ctx.lineWidth=(c.major?1.5:0.9)/s;
    ctx.stroke(c.path);
  }
  ctx.restore();
  /* 고도 값은 확대했을 때만 적는다. 전체를 볼 때 숫자를 뿌리면
     지도가 아니라 표가 된다. 굵은 선부터 붙고, 더 당기면 가는 선에도 붙는다 —
     티어에 따라 굵은 선이 한둘뿐이라 그것만으로는 화면에 안 잡힌다. */
  if(zoom<2.5) return;
  const minorToo=zoom>=4;
  ctx.save();
  ctx.font='600 9.5px ui-monospace,Consolas,monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(const c of contours){
    if(!c.major&&!minorToo) continue;
    let n=0;
    for(let k=0;k<c.pts.length&&n<3;k+=2){
      const X=(c.pts[k]-vx)*s, Y=(c.pts[k+1]-vy)*s;
      if(X<28||Y<16||X>cv.width-28||Y>cv.height-52) continue;
      n++;
      const t=`${c.lv}`, tw=ctx.measureText(t).width;
      ctx.fillStyle='rgba(245,247,242,.86)'; ctx.fillRect(X-tw/2-3,Y-7,tw+6,14);
      ctx.fillStyle='rgba(38,30,16,.95)';    ctx.fillText(t,X,Y);
    }
  }
  ctx.restore();
}
/* ── 아홉 구역 ──────────────────────────────────────────────────────────
   좌표로는 "어디 있었나"를 말할 수 없다. 육지 외접 상자를 3x3 으로 갈라
   이름을 붙이고, 지도에도 그 선을 얹어 표의 '지역'과 눈이 맞물리게 한다.
   개체보다 위에 그리지만 아주 옅게 — 지도를 가리면 구역이 지형을 이긴다. */
function drawRegions(SX,SY){
  const b=W.regionBox; if(!b) return;
  ctx.save();
  ctx.setLineDash([6,5]); ctx.lineWidth=1.2;
  ctx.strokeStyle='rgba(245,247,242,.42)';
  ctx.beginPath();
  for(let k=1;k<=2;k++){
    const x=SX(b.x0+b.w*k/3), y=SY(b.y0+b.h*k/3);
    ctx.moveTo(x,SY(b.y0)); ctx.lineTo(x,SY(b.y0+b.h));
    ctx.moveTo(SX(b.x0),y);  ctx.lineTo(SX(b.x0+b.w),y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font='600 11px ui-monospace,Consolas,monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(let r=0;r<3;r++)for(let c=0;c<3;c++){
    const k=r*3+c;
    if(!W.regionCells[k]) continue;                 // 통째로 바다인 칸에는 이름을 안 붙인다
    const x=SX(b.x0+b.w*(c+0.5)/3), y=SY(b.y0+b.h*(r+0.5)/3);
    if(x<0||y<0||x>cv.width||y>cv.height) continue;
    const t=REGION_NAMES[k], tw=ctx.measureText(t).width;
    ctx.fillStyle='rgba(20,24,18,.30)'; ctx.fillRect(x-tw/2-4,y-9,tw+8,18);
    ctx.fillStyle='rgba(245,247,242,.80)'; ctx.fillText(t,x,y);
  }
  ctx.restore();
}
/* ── 축척 ──────────────────────────────────────────────────────────────
   "1px ≈ 몇 m"는 머리로 곱해야 읽히고, 확대할 때마다 다시 곱해야 한다.
   막대는 그 곱셈을 눈이 대신한다. 1·2·5 계열에서 화면 폭의 5분의 1쯤에
   가장 가까운 값을 골라, 확대해도 막대 길이가 크게 변하지 않게 한다. */
const SCALE_NICE=[10,20,50,100,200,500,1000,2000,5000,10000,20000,50000];
function drawScaleBar(){
  const mPerPx=W.T.cellM*visCells()/cv.width;
  const want=mPerPx*cv.width*0.20;
  let m=SCALE_NICE[0];
  for(const n of SCALE_NICE) if(n<=want) m=n;
  const bw=m/mPerPx, x=cv.width-22-bw, y=cv.height-26;
  const lab=m>=1000?`${(m/1000).toLocaleString('en-US')} km`:`${m} m`;
  ctx.save();
  ctx.font='600 11px ui-monospace,Consolas,monospace';
  ctx.textBaseline='alphabetic';
  ctx.fillStyle='rgba(245,247,242,.86)';
  ctx.fillRect(x-11,y-19,bw+22,31);
  ctx.strokeStyle='rgba(24,28,23,.30)'; ctx.lineWidth=1;
  ctx.strokeRect(x-10.5,y-18.5,bw+21,30);
  /* 네 칸 흑백 교대 — 절반과 4분의 1을 눈으로 나눠 읽을 수 있다 */
  const seg=bw/4;
  for(let k=0;k<4;k++){
    ctx.fillStyle=k%2?'#F5F7F2':'#181C17';
    ctx.fillRect(x+k*seg,y,seg,5);
  }
  ctx.strokeStyle='#181C17'; ctx.strokeRect(x+.5,y+.5,bw,5);
  ctx.fillStyle='#181C17';
  ctx.textAlign='center'; ctx.fillText(lab,x+bw/2,y-5);
  ctx.font='9.5px ui-monospace,Consolas,monospace';
  ctx.fillStyle='rgba(24,28,23,.62)';
  ctx.textAlign='left'; ctx.fillText('0',x,y+11);
  ctx.restore();
}
const px=[0,0,0];
/* 지형을 오프스크린에 굽는다. 지도와 생애 화면이 같은 그림을 나눠 쓴다 —
   생애 동선을 빈 바탕에 그리면 어디를 다녔는지 알 수 없다. */
let terrainFrame=-1;
function renderTerrain(){
  if(terrainFrame===frameN) return;
  terrainFrame=frameN;
  const g=W.g,d=img.data,L=LAYERS[layer];
  for(let i=0;i<g.N;i++){
    let r,gr,b;
    if(!W.land[i]){r=13;gr=39;b=49;}
    else{ L.rgb(W,i,px); r=px[0];gr=px[1];b=px[2];
      if(W.water[i]===2){r=42;gr=114;b=133;}
      else if(W.water[i]===1&&W.soil[i]>TUNE.seasonalWaterMinSoilMm){r=88;gr=147;b=158;}
      if(W.fire[i]){r=232;gr=98;b=42;} }
    const o=i*4; d[o]=r;d[o+1]=gr;d[o+2]=b;d[o+3]=255;
  }
  octx.putImageData(img,0,0);
}
function paintMap(){
  const g=W.g;
  renderTerrain();
  ctx.imageSmoothingEnabled=false;
  const v=visCells();
  ctx.drawImage(off,vx,vy,v,v,0,0,cv.width,cv.height);
  const s=cv.width/v, N=g.N;                    // 셀 하나가 몇 픽셀인가
  const SX=x=>(x-vx)*s, SY=y=>(y-vy)*s;
  /* 등고선은 지형이므로 개체보다 아래에 깐다 */
  if(showContour) drawContours(s);
  if(showRegion) drawRegions(SX,SY);
  const seen=(x,y,pad)=>x>=vx-pad&&x<=vx+v+pad&&y>=vy-pad&&y<=vy+v+pad;
  /* 확대하면 셀 하나가 넓어지므로 점을 더 뿌려도 뭉치지 않는다.
     기준은 그대로 1점 = T2_PER_DOT 마리다(범례에 적어 둔 값). */
  const dotMax=Math.min(8,Math.max(2,Math.round(zoom*2)));
  ctx.globalAlpha=.5;
  const x0=Math.max(0,vx|0), x1=Math.min(g.W-1,Math.ceil(vx+v)), y0=Math.max(0,vy|0), y1=Math.min(g.H-1,Math.ceil(vy+v));
  const dotPx=Math.max(1.2,Math.min(4,1.6*Math.sqrt(zoom)));
  for(const id of W.byTier.T2){
    if(W.species[id].status==='ABSENT') continue;
    ctx.fillStyle=dotColor(W,id,'--t2');
    /* 종별색일 때는 막대 방향으로도 가른다 — 밀도장은 점이 촘촘해
       색보다 결이 먼저 읽힌다. */
    const bar=dotMode==='species'?speciesMark[id]:null;
    const bw=bar?dotPx*bar[0]/2:dotPx, bh=bar?dotPx*bar[1]/2:dotPx;
    const o=W.t2Idx.get(id)*N;
    for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
      const i=g.idx(xx,yy);
      if(!W.land[i]) continue;
      const k=Math.min(dotMax,W.t2d[o+i]/t2PerDot|0);
      for(let m=0;m<k;m++){
        const hx=((i*2654435761+m*40503+id*7919)>>>8&255)/255, hy=((i*1597334677+m*22695+id*104729)>>>8&255)/255;
        ctx.fillRect(SX(xx+hx),SY(yy+hy),bw,bh);
      }
    }
  }
  ctx.globalAlpha=1; ctx.lineWidth=1; ctx.strokeStyle='rgba(20,24,18,.55)';
  const rz=Math.min(2.5,Math.sqrt(zoom));
  for(const p of W.p4){ if(!seen(p.x,p.y,1)) continue;
    ctx.fillStyle=dotColor(W,p.sp,'--t4');
    markPath(dotMode==='species'?speciesMark[p.sp]:'circle',SX(IX(p)),SY(IY(p)),2*rz);
    ctx.fill();ctx.stroke();}
  /* T3 : 이제 무리라는 객체가 없다. 점 하나가 개체 하나다.
     다 그리면 수만 개라 화면이 뭉개지므로, 넓게 볼 때는 솎아 그리고
     솎은 비율을 범례에 적는다. 확대하면 한 마리씩 다 보인다. */
  {
    /* 개체는 슬롯이다. 화면 안의 슬롯 번호만 모았다가 솎아 그린다.
       종별색일 때는 종마다 묶어 그린다 — 점마다 색을 바꾸면 그때마다
       캔버스 상태가 갈아엎힌다. */
    const A=W.A, visible=[];
    for(let i=0;i<A.top;i++)
      if(!A.dead[i]&&seen(A.x[i],A.y[i],1)) visible.push(i);
    /* ── 솎을 때는 '몇 번째'가 아니라 '누구'로 고른다 ────────────────────
       예전에는 목록에서 stride 칸씩 건너뛰어 골랐다. 그런데 목록은 슬롯을
       훑어 만든 것이라, 한 마리가 죽거나 태어나면 뒤가 통째로 한 칸씩
       밀린다 — 고르던 짝수 번째가 홀수 번째로 바뀌어 화면의 점이 프레임마다
       전부 갈린다. 재생 중에 지도가 자글거리며 흔들려 보이던 것이 이것이다.
       그래서 슬롯 번호를 해시해 남길지 말지를 정한다. 그 슬롯이 살아 있는
       동안 판정이 변하지 않으니, 점은 움직일 뿐 깜빡이지 않는다.

       솎는 비율도 2의 거듭제곱으로 끊는다. 1/2 → 1/4 로 갈 때 남는 쪽이
       앞의 부분집합이 되어(같은 해시에 문턱만 낮추므로) 점이 한꺼번에
       갈리지 않고 절반만 조용히 빠진다. */
    const need=visible.length/SCATTER_BUDGET;
    let stride=1; while(stride<need) stride*=2;
    const keep=1024/stride;
    const pick=i=>stride<=1||(((i*2654435761)>>>8)&1023)<keep;
    scatterNote=stride<=1?'점 1개 = 개체 하나'
      :`점 1개 = 개체 하나 · ${stride}마리 중 1마리만 표시(예산)`;
    const rDot=Math.max(1.1,1.4*rz);
    const groups=dotMode==='species'?W.byTier.T3:[null];
    for(const gid of groups){
      ctx.fillStyle=gid==null?cssVar('--t3'):dotColor(W,gid,'--t3');
      const mk=gid==null?'circle':speciesMark[gid];
      for(const i of visible){
        if(!pick(i)) continue;
        if(gid!=null&&A.sp[i]!==gid) continue;
        markPath(mk,SX(AIX(A,i)),SY(AIY(A,i)),rDot); ctx.fill();
      }
    }
  }
  ctx.strokeStyle='rgba(255,255,255,.7)';
  for(const p of W.p5){ if(!seen(p.x,p.y,1)) continue;
    ctx.fillStyle=dotColor(W,p.sp,'--t5');
    markPath(dotMode==='species'?speciesMark[p.sp]:'circle',SX(IX(p)),SY(IY(p)),3*rz);
    ctx.fill();ctx.stroke();}
  const sel=findInd(selUid);
  if(sel&&sel.deathDay==null){
    if(sel.track.length>1){
      ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=1.6; ctx.beginPath();
      sel.track.forEach((p,i)=>i?ctx.lineTo(SX(p[1]),SY(p[2])):ctx.moveTo(SX(p[1]),SY(p[2])));
      ctx.stroke();
    }
    ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.arc(SX(IX(sel)),SY(IY(sel)),7,0,6.2832); ctx.stroke();
  }
  drawScaleBar();
  if(scatterNote!==scatterShown){ scatterShown=scatterNote; drawLegend(); }
}
/* 지도를 눌러 개체를 고른다. 무리를 누르면 그 무리의 대표가 잡힌다. */
function pickAt(fx,fy){
  const lim=Math.max(1.5,10/(cv.width/visCells()));   // 화면 10px 안
  let best=null,bd=lim*lim;
  const test=(o,ind)=>{ if(!ind) return;
    const dx=IX(o)-fx, dy=IY(o)-fy, d=dx*dx+dy*dy;
    if(d<bd){ bd=d; best=ind; } };
  for(const p of W.p5) test(p,p);
  for(const p of W.p4) test(p,p);
  /* 초식은 표본만 이름을 갖는다. 이름 없는 개체를 고르면 그 자리에서
     추적 대상으로 승격한다 — 클릭한 그 한 마리를 따라갈 수 있어야 한다. */
  const A=W.A;
  let bestAni=-1, ad=bd;
  for(let i=0;i<A.top;i++){
    if(A.dead[i]) continue;
    const dx=AIX(A,i)-fx, dy=AIY(A,i)-fy, d=dx*dx+dy*dy;
    if(d<ad){ ad=d; bestAni=i; }
  }
  if(bestAni>=0&&ad<=bd){ best=A.ind[bestAni]||attachInd(W,bestAni); bd=ad; }
  if(best){ selUid=best.uid; drawInd(); drawLife();
    $('vCursor').textContent=`선택 · ${best.name}`; }
  return !!best;
}
function fitMap(){
  if($('mapCard').dataset.open!=='true') return;
  const a=Math.min(window.innerWidth-80,window.innerHeight-200,900);
  cv.style.width=cv.style.height=Math.max(360,a)+'px';
}

/* 차트 */
const PAD={l:44,r:14,t:10,b:20};
const path=(pts,X,Y)=>pts.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join('');
const ticks=(m,n)=>{const o=[];for(let i=0;i<=n;i++)o.push(m*i/n);return o;};
/* 개체군 차트 — 등급 합계와 종별을 오가고, 시간축을 확대할 수 있다.
   300년을 한 화면에 밀어 넣으면 초기 20년의 요동이 한 픽셀로 뭉개진다. */
let popMode='tier', popTiers=new Set(['T0','T1','T2','T3','T4','T5']), tFrom=null, tTo=null;
function popSpan(){
  const s=W.samples;
  if(!s.length) return [0,1];
  const a=s[0].t, b=Math.max(s[s.length-1].t,a+0.01);
  return [tFrom==null?a:clamp(tFrom,a,b), tTo==null?b:clamp(tTo,a,b)];
}
function popRangeLabel(){
  const s=W.samples; if(!s.length) return;
  const [a,b]=popSpan();
  const full=tFrom==null&&tTo==null;
  $('popRange').textContent=full?`전체 구간 (${(s[s.length-1].t-s[0].t).toFixed(0)}년)`
    :`${a.toFixed(1)}~${b.toFixed(1)}년 (${(b-a).toFixed(1)}년)`;
}
function drawPop(){
  const svg=$('chPop'),Wd=720,Ht=190,all=W.samples;
  if(all.length<2){svg.innerHTML='';return;}
  const [t0,t1]=popSpan();
  const s=all.filter(p=>p.t>=t0&&p.t<=t1);
  if(s.length<2){svg.innerHTML='';popRangeLabel();return;}
  /* 계열을 만든다. 등급 모드는 합계를, 종별 모드는 종마다 자기 등급의
     유도 부양력 몫(seedN)으로 나눈 값을 쓴다. 그래야 한 축에 놓인다. */
  let ser;
  if(popMode==='tier'){
    ser=POP.filter(t=>popTiers.has(t.cap)).map(t=>({
      name:t.lab, cap:t.cap, tag:t.cap,
      pts:s.map(p=>[p.t,(Number.isFinite(p[t.cap])?p[t.cap]:0)/Math.max(W.cap[t.cap],1)*100])}));
  } else {
    ser=W.trackedSpec.map((id,k)=>({sp:W.species[id],k}))
      .filter(o=>popTiers.has(o.sp.trophic))
      .map(o=>({ name:o.sp.name, cap:o.sp.trophic, tag:o.sp.name,
        ref:Math.max(o.sp.seedN||1,1),
        pts:s.map(p=>[p.t,(p.per&&Number.isFinite(p.per[o.k])?p.per[o.k]:0)/Math.max(o.sp.seedN||1,1)*100])}));
  }
  /* 식물은 개체수가 아니라 '지금 자랄 수 있는 최대까지 얼마나 찼는가'로 얹는다.
     T3 가 왜 주는지는 먹이가 줄어서인지 뜯겨서인지를 갈라야 보인다. */
  if(popTiers.has('T0')){
    ser=ser.concat([
      {name:'T0 초본 (부양력 대비)', cap:'T0', tag:'초본', dash:'4 3',
       pts:s.map(p=>[p.t,Number.isFinite(p.grassFill)?p.grassFill:0])},
      {name:'T0 목본 임관', cap:'T0', tag:'목본', dash:'1 3',
       pts:s.map(p=>[p.t,Number.isFinite(p.woodyPct)?p.woodyPct:0])}]);
  }
  let max=100; for(const e of ser) for(const p of e.pts) if(p[1]>max) max=p[1];
  max=Math.ceil(max/25)*25;
  const X=v=>PAD.l+(v-t0)/Math.max(t1-t0,1e-6)*(Wd-PAD.l-PAD.r);
  const Y=v=>Ht-PAD.b-clamp(v/max,0,1)*(Ht-PAD.t-PAD.b);
  svg.innerHTML=ticks(max,4).map(v=>
    `<line x1="${PAD.l}" x2="${Wd-PAD.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--grid)"/>
     <text x="${PAD.l-7}" y="${(Y(v)+3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--ink-3)">${v}%</text>`).join('')
   +`<line x1="${PAD.l}" x2="${Wd-PAD.r}" y1="${Y(100).toFixed(1)}" y2="${Y(100).toFixed(1)}" stroke="var(--ink-3)" stroke-dasharray="3 3" opacity=".7"/>`
   +ser.map(e=>`<path d="${path(e.pts,X,Y)}" fill="none" stroke="var(${TIER_VAR[e.cap]||'--ink-2'})" stroke-width="${popMode==='tier'?2:1.4}" ${e.dash?`stroke-dasharray="${e.dash}"`:''} stroke-linejoin="round" opacity="${popMode==='tier'?1:.85}"/>`).join('')
   +ser.map(e=>{const p=e.pts[e.pts.length-1];
     return `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.6" fill="var(${TIER_VAR[e.cap]||'--ink-2'})" stroke="var(--panel)" stroke-width="2"/>
     <text x="${(X(p[0])+6).toFixed(1)}" y="${(Y(p[1])+3.5).toFixed(1)}" font-size="9.5" font-weight="600" fill="var(${TIER_VAR[e.cap]||'--ink-2'})">${e.tag}</text>`;}).join('')
   +`<text x="${PAD.l}" y="${Ht-5}" font-size="9.5" fill="var(--ink-3)">${t0.toFixed(1)}년</text>
     <text x="${Wd-PAD.r}" y="${Ht-5}" font-size="9.5" fill="var(--ink-3)" text-anchor="end">${t1.toFixed(1)}년</text>`;
  $('legPop').innerHTML=ser.map(e=>`<span style="color:var(${TIER_VAR[e.cap]||'--ink-2'})"><i></i>${e.name}</span>`).join('')
    +`<span style="color:var(--ink-3)">┈ 100% = ${popMode==='tier'?'[I-4] 유도 부양력':'종별 유도 배분'}</span>`;
  popRangeLabel();
}
function drawSpecChart(){
  const svg=$('chSpec'),Wd=350,Ht=150,s=W.samples;
  if(s.length<2){svg.innerHTML='';return;}
  const t0=s[0].t,t1=Math.max(s[s.length-1].t,t0+.01);
  const keys=[['s2','T2'],['s3','T3'],['s4','T4'],['s5','T5']];
  let max=1; for(const p of s) for(const [k] of keys) if(p[k]>max) max=p[k];
  max=Math.ceil(max/2)*2;
  const X=v=>PAD.l+(v-t0)/(t1-t0)*(Wd-PAD.l-PAD.r), Y=v=>Ht-PAD.b-clamp(v/max,0,1)*(Ht-PAD.t-PAD.b);
  svg.innerHTML=ticks(max,3).map(v=>
    `<line x1="${PAD.l}" x2="${Wd-PAD.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--grid)"/>
     <text x="${PAD.l-7}" y="${(Y(v)+3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--ink-3)">${Math.round(v)}</text>`).join('')
   +keys.map(([k,t])=>`<path d="${path(s.map(p=>[p.t,p[k]]),X,Y)}" fill="none" stroke="var(${TIER_VAR[t]})" stroke-width="2" stroke-linejoin="round"/>`).join('')
   +`<text x="${PAD.l}" y="${Ht-5}" font-size="9.5" fill="var(--ink-3)">${t0.toFixed(0)}년</text>
     <text x="${Wd-PAD.r}" y="${Ht-5}" font-size="9.5" fill="var(--ink-3)" text-anchor="end">종</text>`;
  $('legSpec').innerHTML=keys.map(([,t])=>`<span style="color:var(${TIER_VAR[t]})"><i></i>${t}</span>`).join('');
}
function drawBars(){
  const svg=$('chFire'),Wd=350,Ht=150,vals=W.years.map(r=>[r.year,r.burnPct]);
  if(!vals.length){svg.innerHTML=`<text x="${PAD.l}" y="${Ht/2}" font-size="10.5" fill="var(--ink-3)">첫 해가 끝나면 기록됩니다</text>`;return;}
  let max=0; for(const v of vals) if(v[1]>max) max=v[1];
  max=Math.max(Math.ceil(max/10)*10,10);
  const n=vals.length,bw=Math.max(1,(Wd-PAD.l-PAD.r)/n-2),Y=v=>Ht-PAD.b-clamp(v/max,0,1)*(Ht-PAD.t-PAD.b);
  svg.innerHTML=ticks(max,3).map(v=>
    `<line x1="${PAD.l}" x2="${Wd-PAD.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--grid)"/>
     <text x="${PAD.l-7}" y="${(Y(v)+3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--ink-3)">${v}</text>`).join('')
   +vals.map((v,i)=>{const x=PAD.l+i*((Wd-PAD.l-PAD.r)/n)+1,h=Ht-PAD.b-Y(v[1]);
     return `<rect x="${x.toFixed(1)}" y="${Y(v[1]).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h,0).toFixed(1)}" fill="var(--warn)" rx="1.5"><title>${v[0]}년 ${v[1].toFixed(0)}%</title></rect>`;}).join('')
   +`<text x="${PAD.l}" y="${Ht-5}" font-size="9.5" fill="var(--ink-3)">0년</text>
     <text x="${Wd-PAD.r}" y="${Ht-5}" font-size="9.5" fill="var(--ink-3)" text-anchor="end">% / 년</text>`;
}

/* 종 목록 */
let specSort={k:'n',dir:-1}, selSpec=null;
const SPEC_COLS=[['name','종',s=>markSvg(s.id)+' '+s.name,'nm'],['trophic','등급',s=>s.trophic,'nm'],
  ['massKg','체중 kg',s=>s.massKg?s.massKg.toFixed(1):'–'],
  ['diet','식이폭',s=>s.diet?s.diet.length:'–'],
  ['droughtTol','내건성',s=>s.droughtTol!=null?s.droughtTol.toFixed(2):'–'],
  ['lifespanYr','수명 년',s=>s.lifespanYr?s.lifespanYr.toFixed(0):'–'],
  ['seedN','초기',s=>s.seedN!=null?fmt(s.seedN):'–'],
  ['n','현재',s=>s.kind==='PLANT'||s.aggregate?'–':fmt(s.n)],
  ['milestones','발자취',s=>s.milestones?s.milestones.length:'–'],
  ['status','상태',s=>{
    if(s.kind==='PLANT') return `<span class="st">${s.simulated?'시뮬':'집계'}</span>`;
    if(s.aggregate) return '<span class="st">집계</span>';
    if(s.status==='ABSENT') return '<span class="st no">결번</span>';
    if(s.extinctYear!=null) return `<span class="st no">절멸 ${s.extinctYear}년</span>`;
    const v=viability(s.n);
    return `<span class="st ${v==='자립'?'ok':v==='준자립'?'warn':'no'}">${v}</span>`;}]];
function drawSpec(){
  const rows=W.species.filter(s=>specTier==='ALL'||s.trophic===specTier)
    .filter(s=>!(s.trophic==='T1'&&specTier==='ALL'));
  rows.sort((a,b)=>{const k=specSort.k;
    const av=a[k]??-1,bv=b[k]??-1;
    return (typeof av==='string'?av.localeCompare(bv):av-bv)*specSort.dir;});
  $('tSpec').tHead.innerHTML='<tr>'+SPEC_COLS.map(c=>
    `<th data-k="${c[0]}">${c[1]}${specSort.k===c[0]?(specSort.dir>0?' ▲':' ▼'):''}</th>`).join('')+'</tr>';
  $('tSpec').tBodies[0].innerHTML=rows.map(s=>
    `<tr data-sid="${s.id}"${s.id===selSpec?' aria-selected="true"':''}>`
    +SPEC_COLS.map(c=>`<td class="${c[3]||''}">${c[2](s)}</td>`).join('')+'</tr>').join('');
}
/* 개체 조회 — 표 머리를 누르면 그 열로 정렬한다(다시 누르면 역순).
   자손 · 사냥 · 최대무리로 줄을 세우면 그것이 곧 레거시 조회다.
   W.inds 는 죽은 개체도 지우지 않으므로 판 전체가 여기 다 있다. */
let indSort={k:'age',dir:-1};
const IND_COLS=[
  ['name','이름',(w,i)=>i.name,'nm',(w,i)=>i.name],
  ['trophic','등급',(w,i)=>w.species[i.sp].trophic,'nm',(w,i)=>w.species[i.sp].trophic],
  ['sp','종',(w,i)=>w.species[i.sp].name,'nm',(w,i)=>w.species[i.sp].name],
  ['sex','성',(w,i)=>i.sex==='M'?'수':'암','nm',(w,i)=>i.sex],
  ['age','나이',(w,i)=>indAge(w,i).toFixed(1),'',(w,i)=>indAge(w,i)],
  /* 초기 배치 개체는 나이를 흩뿌리려 bornDay 가 음수다(코호트 동조 방지).
     그대로 찍으면 "출생 -15.6년"이 되어 버그처럼 읽힌다. */
  ['born','출생',(w,i)=>i.bornDay<0?`시작전 ${(-i.bornDay/365).toFixed(1)}`
    :(i.bornDay/365).toFixed(1),'',(w,i)=>i.bornDay],
  ['offspring','자손',(w,i)=>i.offspring||'–','',(w,i)=>i.offspring],
  /* 후손으로 줄을 세우면 그것이 곧 '누가 판에 오래 남았나' 다 */
  ['descendants','후손',(w,i)=>i.descendants||'–','',(w,i)=>i.descendants,
    '자식 · 손자 · 그 아래까지 대 수 제한 없이 세어 내려간 수(추적 대상만). 죽은 뒤에도 는다 — 번영은 당사자가 없어진 다음의 이야기다.'],
  /* 남긴 수보다 남아 있는 수가 혈통을 말한다. 다 죽었으면 그 줄은 끊긴 것이다. */
  ['descLive','혈통',(w,i)=>i.descendants
      ? (i.descLive?`<span class="st ok">${fmt(i.descLive)}</span>`:'<span class="st no">끊김</span>')
      : '–','',(w,i)=>i.descLive,
    '후손 중 지금 살아 있는 수. 남겼는데 하나도 안 남았으면 끊김이다. 조상은 자기 후손을 모두 품으므로 언제나 자식보다 크거나 같다.'],
  /* 지역 : 산 놈은 지금 어디에 있고, 죽은 놈은 어디에서 살았는가.
     좌표는 읽히지 않지만 '남동'은 읽힌다 — 지도의 [구역] 단추와 같은 칸이다. */
  ['region','지역',(w,i)=>{
      if(i.deathDay==null) return REGION_NAMES[regionOf(w,i.x,i.y)];
      const h=homeRegion(w,i);
      return h?`<span style="color:var(--ink-3)">${h.name}</span>`:'–';
    },'nm',(w,i)=>i.deathDay==null?regionOf(w,i.x,i.y)
      :(homeRegion(w,i)?.region ?? 9),
    '판을 3×3 으로 가른 구역. 살아 있으면 지금 있는 곳, 죽었으면 동선에서 가장 오래 머문 곳(옅은 글씨)이다.'],
  ['crises','위기극복',(w,i)=>i.crises||'–','',(w,i)=>i.crises],
  ['escapes','모면',(w,i)=>i.escapes||'–','',(w,i)=>i.escapes],
  ['kills','사냥',(w,i)=>i.kills>=1?fmt(i.kills):'–','',(w,i)=>i.kills],
  ['peakHerd','최대무리',(w,i)=>i.peakHerd>=1?fmt(i.peakHerd):'–','',(w,i)=>i.peakHerd],
  ['state','상태',(w,i)=>i.deathDay==null?'<span class="st ok">생존</span>'
    :`<span class="st ${i.fate==='merge'?'warn':'no'}">${i.cause}</span>`,'',
    (w,i)=>i.deathDay==null?2:i.fate==='merge'?1:0],
  ['ev','사건',(w,i)=>i.ev.length,'',(w,i)=>i.ev.length]];
/* 후손 · 혈통은 볼 때 센다. 3만 마리 판에서 전수 계산이 50ms 라, 도는 동안
   프레임마다 부르면 재생이 눌린다 — 그때는 초에 한 번으로 끊는다(값이 1초
   늦어도 표시용이라 문제가 없다). 멈춰 있으면 곧바로 센다. */
let lineAt=-1e9;
function needLineage(){
  const t=performance.now();
  if(playing&&t-lineAt<1000) return;
  lineAt=t; refreshLineage(W);
}
function allInds(){
  needLineage();
  let a=W.inds;
  if(indLive==='alive') a=a.filter(i=>i.deathDay==null);
  else if(indLive==='dead') a=a.filter(i=>i.deathDay!=null&&i.fate!=='merge');
  if(indSex!=='all') a=a.filter(i=>i.sex===indSex);
  if(indSpec!=='ALL') a=a.filter(i=>i.sp===indSpec);
  /* 혈통 : 후손을 남겼는데 그중 살아 있는 것이 하나도 없으면 끊긴 것이다.
     애초에 자손이 없던 개체는 '끊김'이 아니라 '없음'이라 어느 쪽에도 안 넣는다. */
  if(indLine==='on') a=a.filter(i=>i.descLive>0);
  else if(indLine==='off') a=a.filter(i=>i.descendants>0&&!i.descLive);
  if(indQuery){ const q=indQuery.toLowerCase();
    a=a.filter(i=>i.name.toLowerCase().includes(q)||W.species[i.sp].name.toLowerCase().includes(q)); }
  /* 정렬 키는 미리 한 번씩만 뽑는다. 비교 함수 안에서 뽑으면 개체 하나가
     log n 번 계산된다 — '지역' 키는 동선을 훑으므로(homeRegion) 4만 마리 판에서
     수억 번의 점 순회가 된다. 값싼 키에도 손해는 없다. */
  const col=IND_COLS.find(c=>c[0]===indSort.k)||IND_COLS[4], key=col[4], d=indSort.dir;
  const dec=a.map(i=>({i,v:key(W,i)}));
  const str=typeof dec[0]?.v==='string';
  dec.sort((x,y)=>(str?String(x.v).localeCompare(String(y.v)):x.v-y.v)*d||(y.i.uid-x.i.uid));
  return dec.slice(0,300).map(e=>e.i);
}
const findInd=uid=>uid==null?null:W.inds.find(i=>i.uid===uid);
function drawInd(){
  const rows=allInds();
  const alive=W.inds.reduce((s,i)=>s+(i.deathDay==null?1:0),0);
  const filt=[indLive!=='all'?(indLive==='alive'?'생존':'사망'):null,
              indSex!=='all'?(indSex==='F'?'암':'수'):null,
              indLine!=='all'?(indLine==='on'?'혈통 이어짐':'혈통 끊김'):null,
              indSpec!=='ALL'?W.species[indSpec].name:null,
              indQuery?`"${indQuery}"`:null].filter(Boolean);
  $('indMeta').textContent=`전체 ${fmt(W.inds.length)} · 생존 ${fmt(alive)}`
    +` · 표시 ${fmt(rows.length)}(상위 300)`
    +(filt.length?` · 거름 ${filt.join(' + ')}`:'')
    +` · 정렬 ${(IND_COLS.find(c=>c[0]===indSort.k)||[])[1]||''}`;
  $('tInd').tHead.innerHTML='<tr>'+IND_COLS.map(c=>
    `<th data-k="${c[0]}"${c[5]?` title="${c[5]}"`:''}>${c[1]}${indSort.k===c[0]?(indSort.dir>0?' ▲':' ▼'):''}</th>`).join('')+'</tr>';
  $('tInd').tBodies[0].innerHTML=rows.length?rows.map(i=>
    `<tr data-uid="${i.uid}"${i.uid===selUid?' aria-selected="true"':''}>`
    +IND_COLS.map(c=>`<td class="${c[3]||''}">${c[2](W,i)}</td>`).join('')+'</tr>').join('')
    :`<tr><td colspan="${IND_COLS.length}" style="text-align:left;color:var(--ink-3)">해당 개체가 없습니다</td></tr>`;
}
const EV_LABEL={birth:'탄생',death:'사망',hunt:'사냥',breed:'번식',move:'이동',fire:'화재',
                crisis:'위기',escape:'모면',legacy:'가문'};
/* 해석 이전의 숫자. 사건이 왜 그 해에 났는지는 이 표에서 확인한다. */
function yearlyTable(sp){
  const Y=sp.yearly||[];
  if(!Y.length) return '';
  /* T2 는 밀도장이라 개체 단위 집계가 없다. 0으로 채운 표는 오해를 부른다. */
  if(!Y.some(r=>r.born||r.died||r.eaten||r.cells))
    return `<div class="lab" style="margin:6px 0 4px;color:var(--ink-3)">밀도장이라 개체 단위 집계가 없습니다 — 개체수만 남습니다</div>`;
  const rows=Y.slice(-12).reverse();
  return `<div class="lab" style="margin:6px 0 4px">해마다 (최근 ${rows.length}년)</div>
    <div class="tw" style="max-height:150px"><table class="mini"><thead><tr>
      <th>연차</th><th>개체수</th><th>출생</th><th title="에너지가 바닥나 죽음">아사</th>
      <th title="수분이 바닥나 죽음">갈증</th><th title="수명을 다해 죽음">노쇠</th>
      <th title="잡아먹힘">피식</th>
      <th>서식%</th><th>최대군집</th><th>평균나이</th></tr></thead><tbody>`
    +rows.map(r=>`<tr><td>${r.year}</td><td>${fmt(r.n)}</td><td>${fmt(r.born)}</td>`
      +`<td>${fmt(r.starved||0)}</td><td>${fmt(r.thirst||0)}</td><td>${fmt(r.aged||0)}</td>`
      +`<td>${fmt(r.eaten)}</td><td>${r.rangePct.toFixed(0)}</td>`
      +`<td>${fmt(r.maxClump)}</td><td>${r.meanAge.toFixed(1)}</td></tr>`).join('')
    +`</tbody></table></div>`;
}
/* 종의 발자취 — 고른 종이 지나온 사건을 연표로 편다 */
function drawTrail(){
  const sp=W.species.find(s=>s.id===selSpec);
  const box=$('trail');
  if(!sp||!sp.milestones||!sp.milestones.length){
    box.innerHTML='<p style="color:var(--ink-3);font-size:11px;margin:0">'
      +(selSpec==null?'위에서 종을 고르면 발자취가 표시됩니다.':'아직 남긴 발자취가 없습니다.')+'</p>';
    return;
  }
  box.innerHTML=`<div class="hd"><b>${sp.name}</b>
      <span class="chip" style="border-color:var(${TIER_VAR[sp.trophic]});color:var(${TIER_VAR[sp.trophic]})">${sp.trophic}</span>
      ${sp.extinctYear!=null?`<span class="chip no">절멸 ${sp.extinctYear}년</span>`:''}</div>
    <dl class="meta">
      <dt>최대</dt><dd>${fmt(sp.peakN)}마리 · ${sp.peakYear}년</dd>
      <dt>최저</dt><dd>${fmt(sp.minN)}마리 · ${sp.minYear}년</dd>
      <dt>유도 배분</dt><dd>${fmt(sp.seedN)}마리</dd>
      <dt>지금</dt><dd>${fmt(sp.n)}마리</dd>
    </dl>
    ${yearlyTable(sp)}
    <div><div class="lab" style="margin:6px 0 4px">발자취 ${sp.milestones.length}건</div>
      <div id="tl">${sp.milestones.slice().reverse().map(e=>
        `<div><time>${e.year}년</time><span class="pip ${e.kind}"></span>
         <span><b>${SPEC_EVENTS[e.kind]?SPEC_EVENTS[e.kind].label:e.kind}</b> · ${e.msg}</span></div>`).join('')}</div></div>`;
}
/* 생애 화면 — 지형 위의 동선과 계보.
   예전에는 빈 바탕에 선만 그려 어디를 다녔는지 알 수 없었다. 지도와 같은
   지형 위에 얹고, 확대 · 이동이 되게 했다. */
let lifeZoom=1, lifeVx=0, lifeVy=0, lifeFor=null;
function lifeView(){
  const cvL=$('lifeMap'), vw=W.g.W/lifeZoom, vh=vw*cvL.height/cvL.width;
  return {cvL,vw,vh};
}
function fitLife(i){
  const {cvL}=lifeView();
  const pts=i.track.length?i.track.map(p=>[p[1],p[2]]):[[i.x,i.y]];
  pts.push([i.x,i.y]);
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const [x,y] of pts){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  const pad=Math.max(3,(Math.max(x1-x0,y1-y0))*0.25);
  const bw=(x1-x0)+2*pad, bh=(y1-y0)+2*pad;
  const need=Math.max(bw, bh*cvL.width/cvL.height);
  lifeZoom=clamp(W.g.W/Math.max(need,2),1,40);
  const {vw,vh}=lifeView();
  lifeVx=(x0+x1)/2-vw/2; lifeVy=(y0+y1)/2-vh/2;
  clampLife();
}
function clampLife(){
  const {vw,vh}=lifeView();
  lifeVx=clamp(lifeVx,-vw*0.1,W.g.W-vw*0.9);
  lifeVy=clamp(lifeVy,-vh*0.1,W.g.H-vh*0.9);
}
function paintLifeMap(i){
  const {cvL,vw,vh}=lifeView();
  const c=cvL.getContext('2d');
  renderTerrain();                       // 지도를 접어 둬도 지형은 준비한다
  c.imageSmoothingEnabled=false;
  c.drawImage(off,lifeVx,lifeVy,vw,vh,0,0,cvL.width,cvL.height);
  const sx=x=>(x-lifeVx)/vw*cvL.width, sy=y=>(y-lifeVy)/vh*cvL.height;
  const tr=i.track;
  if(tr.length>1){
    c.strokeStyle='rgba(255,255,255,.9)'; c.lineWidth=1.6; c.lineJoin='round';
    c.beginPath();
    tr.forEach((p,k)=>k?c.lineTo(sx(p[1]),sy(p[2])):c.moveTo(sx(p[1]),sy(p[2])));
    c.stroke();
    c.fillStyle=cssVar('--good');
    c.beginPath(); c.arc(sx(tr[0][1]),sy(tr[0][2]),3,0,6.2832); c.fill();
  }
  c.fillStyle=i.deathDay==null?cssVar('--crit'):cssVar('--ink-3');
  c.beginPath(); c.arc(sx(i.x),sy(i.y),4,0,6.2832); c.fill();
  c.strokeStyle='rgba(255,255,255,.9)'; c.lineWidth=1.4;
  c.beginPath(); c.arc(sx(i.x),sy(i.y),7,0,6.2832); c.stroke();
  const km=vw*W.cellKm;
  $('lifeMapMeta').textContent=`${tr.length}점 · 화면폭 ${km.toFixed(1)}km · ${lifeZoom.toFixed(1)}×`;
}
/* 형제는 따로 저장하지 않는다. 부모의 자식 목록에서 자기를 뺀 것이 형제다 —
   개체마다 형제 배열을 들고 다니면 같은 사실을 두 번 적는 셈이다.
   부모 둘을 다 공유하면 친형제, 한쪽만 공유하면 반형제로 갈라 보여 준다. */
function siblingsOf(i){
  /* 부모를 둘 다 공유하는 친형제만 센다. 반형제까지 넣으면 아비가 다른
     새끼들이 한 줄에 섞여, 무리 안에서 누가 진짜 한배인지 알 수 없다.
     부모가 한쪽만 기록된 개체는 애초에 판정할 수 없으므로 비운다. */
  const lists=[i.parent,i.parent2].map(u=>{
    const p=findInd(u); return p?p.children:null;
  }).filter(Boolean);
  if(lists.length<2) return [];
  const full=new Set();
  for(const u of lists[0]){
    if(u===i.uid) continue;
    if(lists[1].includes(u)) full.add(u);
  }
  return [...full];
}
/* 계보 : 부모 · 배우자 · 형제 · 자식. 눌러서 그 개체로 건너뛴다. */
/* ── 하위 계보도 ────────────────────────────────────────────────────────
   계보 단추가 '한 칸 옆'(부모 · 배우자 · 형제 · 자식)을 보여준다면,
   이쪽은 '아래로 몇 대'를 보여준다. 자식에서 손자로 눌러 펼친다.
   한 번에 다 그리면 후손이 수백인 개체에서 화면이 무너지므로,
   펼친 가지만 그린다. */
let treeOpen=new Set(), treeCut=0;   // treeCut : [모두 펼치기]가 끊긴 마디 수
function treeNode(ind,viaMate,depth,seen){
  if(seen.has(ind.uid)) return '';
  seen.add(ind.uid);
  const kids=ind.children.map(u=>findInd(u)).filter(Boolean);
  const open=treeOpen.has(ind.uid), has=kids.length>0;
  const alive=ind.deathDay==null;
  const head=`<div class="tnrow">`
    +(has?`<button class="twg" data-tw="${ind.uid}" aria-label="펼치기">${open?'▾':'▸'}</button>`
         :`<span class="twg">·</span>`)
    +markSvg(ind.sp)
    +`<button class="kin" data-uid="${ind.uid}">${ind.name}${alive?'':' †'}</button>`
    +(viaMate?`<small>← ${viaMate}</small>`:'')
    +(depth?`<small>${depth}대</small>`:'')
    +(has?`<small>자식 ${fmt(kids.length)}${ind.offspring>kids.length?`/${fmt(ind.offspring)}`:''}</small>`:'')
    +(ind.descendants?`<small>후손 ${fmt(ind.descendants)} · 생존 ${fmt(ind.descLive)}</small>`:'')
    +`</div>`;
  if(!open||!has) return head;
  const body=kids.map(c=>{
    const other=c.parent===ind.uid?c.parent2:(c.parent2===ind.uid?c.parent:null);
    const m=other!=null?findInd(other):null;
    return treeNode(c,m?m.name:null,depth+1,seen);
  }).join('');
  return head+`<div class="tkid">${body}</div>`;
}
function lineageTree(i){
  const head=`<div class="hd"><span class="lab">하위 계보도</span>`
    +(i.children.length?`<button data-treeall="open">모두 펼치기</button>`
      +`<button data-treeall="close">접기</button>`:'')
    +`<span class="lab" style="color:var(--ink-3)">대 수 제한 없이 내려갑니다`
    +(treeCut?` · 모두 펼치기는 ${fmt(treeCut)}마디에서 끊었습니다`:'')+`</span></div>`;
  if(!i.children.length)
    return head+`<div style="color:var(--ink-3);font-size:10.5px">`
      +(i.offspring
        ? `${fmt(i.offspring)}마리를 남겼지만 그중 추적 대상이 된 자식이 없어 계보를 이을 수 없습니다.`
        : '남긴 자식이 없습니다.')+`</div>`;
  return head+treeNode(i,null,0,new Set());
}
function kinChips(i){
  const one=(uid,tag)=>{
    const k=findInd(uid); if(!k) return '';
    const sp=W.species[k.sp];
    return `<button class="kin" data-uid="${uid}" title="${sp.name} · ${k.sex==='M'?'수':'암'}">`
      +`${k.name}${k.deathDay!=null?' †':''}${tag?`<small>${tag}</small>`:''}</button>`;
  };
  const rows=[];
  const par=[i.parent,i.parent2].filter(u=>u!=null&&findInd(u)).map(u=>one(u)).join('');
  if(par) rows.push(`<dt>부모</dt><dd class="kinbox">${par}</dd>`);
  const mates=i.mates.map(u=>one(u)).filter(Boolean);
  if(mates.length) rows.push(`<dt>배우자 ${mates.length}</dt><dd class="kinbox">${mates.join('')}</dd>`);
  const sibs=siblingsOf(i).map(u=>one(u)).filter(Boolean);
  if(sibs.length) rows.push(`<dt>친형제 ${sibs.length}</dt><dd class="kinbox">${sibs.join('')}</dd>`);
  /* 자식은 '누구와의 자식인가'로 묶는다. 한 줄에 몰아 놓으면 배우자가 여럿일 때
     누구 소생인지 알 수 없다 — 계보에서 가장 궁금한 것이 그것이다. */
  const byMate=new Map(); let shown=0;
  for(const u of i.children){
    const c=findInd(u); if(!c) continue;
    const other = c.parent===i.uid ? c.parent2 : (c.parent2===i.uid ? c.parent : null);
    const key = other==null ? '?' : other;
    if(!byMate.has(key)) byMate.set(key,[]);
    byMate.get(key).push(u); shown++;
  }
  for(const [key,list] of byMate){
    const mate = key==='?' ? null : findInd(key);
    const lab = mate ? `자식 · ${mate.name}${mate.deathDay!=null?' †':''}`
                     : '자식 · 상대 미상';
    rows.push(`<dt>${lab} ${list.length}</dt><dd class="kinbox">`
      +list.map(u=>one(u)).join('')+`</dd>`);
  }
  if(i.offspring>shown)
    rows.push(`<dt>자식 계</dt><dd style="color:var(--ink-3)">${fmt(i.offspring)}마리`
      +` — 그중 ${fmt(i.offspring-shown)}마리는 추적 대상이 아니라 이름이 없습니다</dd>`);
  if(!rows.length) return `<dl class="meta"><dt>계보</dt><dd style="color:var(--ink-3)">기록된 혈연이 없습니다</dd></dl>`;
  return `<dl class="meta">${rows.join('')}</dl>`;
}
/* 어디에서 살았는가. 한 구역에 쏠린 정도까지 적는다 — 절반도 안 되는데
   '남동에 살았다'고 단정하면 그건 요약이 아니라 거짓말이다.
   구역을 하나만 밟은 개체에는 '벗어난 적 없음'을 붙인다. 대형 초식이 하루에
   120m 를 움직이므로(moveGrazeKmDay) 실제로 그런 개체가 대부분이다. */
function regionLine(i){
  const h=homeRegion(W,i);
  if(!h) return '';
  const spread=h.moved<=1?'벗어난 적 없음':`${h.moved}개 구역을 오감`;
  const share=`머문 비율 ${(h.share*100).toFixed(0)}%`;
  if(i.deathDay==null){
    const now=REGION_NAMES[regionOf(W,i.x,i.y)];
    return `<dt>현재 위치</dt><dd>${now}`
      +(now===h.name?` <span style="color:var(--ink-3)">· 주 서식지 · ${spread}</span>`
        :` <span style="color:var(--ink-3)">· 주 서식지 ${h.name}(${share})</span>`)+`</dd>`;
  }
  return `<dt>주 서식지</dt><dd>${h.name}`
    +` <span style="color:var(--ink-3)">· ${share} · ${spread}</span></dd>`;
}
function drawLife(){
  needLineage();
  const i=findInd(selUid);
  if(!i){
    $('lifeHead').innerHTML='<p style="color:var(--ink-3);font-size:11px;margin:0">왼쪽에서 개체를 고르면 생애가 표시됩니다.</p>';
    $('lifeMapWrap').hidden=true; $('lifeKin').innerHTML=''; $('lifeTree').innerHTML='';
    $('lifeTl').innerHTML='';
    lifeFor=null; return;
  }
  const sp=W.species[i.sp], age=indAge(W,i);
  if(lifeFor!==i.uid){ lifeFor=i.uid; fitLife(i); treeOpen=new Set([i.uid]); treeCut=0; }
  $('lifeHead').innerHTML=`
    <div class="hd"><b>${i.name}</b>
      <span class="chip" style="border-color:var(${TIER_VAR[sp.trophic]});color:var(${TIER_VAR[sp.trophic]})">${sp.trophic} ${sp.name}</span>
      ${i.deathDay==null?'<span class="chip ok">생존</span>':`<span class="chip no">${i.cause}</span>`}</div>
    <dl class="meta">
      <dt>성별</dt><dd>${i.sex==='M'?'수':'암'}</dd>
      <dt>나이</dt><dd>${age.toFixed(1)}년 / 수명 ${sp.lifespanYr.toFixed(0)}년</dd>
      <dt>출생</dt><dd>${i.bornDay<0?`시작 ${(-i.bornDay/365).toFixed(1)}년 전 (초기 배치)`
        :`${(i.bornDay/365).toFixed(1)}년차`}</dd>
      ${i.deathDay!=null?`<dt>사망</dt><dd>${(i.deathDay/365).toFixed(1)}년차 · ${i.cause}</dd>`:''}
      ${regionLine(i)}
      <dt>체중</dt><dd>${sp.massKg.toFixed(1)} kg</dd>
      <dt>에너지</dt><dd>${i.e.toFixed(2)} · 수분 ${i.hyd.toFixed(2)}</dd>
      ${i.kills>=1?`<dt>사냥</dt><dd>${fmt(i.kills)}마리</dd>`:''}
      ${i.peakHerd>=1?`<dt>최대 무리</dt><dd>${fmt(i.peakHerd)}마리</dd>`:''}
      ${i.offspring?`<dt>자손 · 후손</dt><dd>${fmt(i.offspring)} · 계 ${fmt(i.descendants)}
        ${i.sawGreat?'<span class="st ok">증손자까지</span>':i.sawGrand?'<span class="st ok">손자까지</span>':''}</dd>`:''}
      ${i.descendants?`<dt>혈통</dt><dd>${i.descLive
        ?`<span class="st ok">이어짐 — 살아 있는 후손 ${fmt(i.descLive)}</span>`
        :'<span class="st no">끊김 — 남은 후손 없음</span>'}</dd>`:''}
      ${i.crises?`<dt>굶주림 극복</dt><dd>${i.crises}회</dd>`:''}
      ${i.escapes?`<dt>포식 모면</dt><dd>${i.escapes}회</dd>`:''}
    </dl>`;
  $('lifeMapWrap').hidden=false;
  paintLifeMap(i);
  $('lifeKin').innerHTML=kinChips(i);
  $('lifeTree').innerHTML=lineageTree(i);
  $('lifeTl').innerHTML=`<div class="lab" style="margin:6px 0 4px">생애 사건 ${i.ev.length}건</div>
      <div id="tl">${i.ev.slice().reverse().map(e=>
        `<div><time>${(e[0]/365).toFixed(1)}년</time><span class="pip ${e[1]}"></span>
         <span>${EV_LABEL[e[1]]||''} · ${e[2]}</span></div>`).join('')}</div>`;
}
function drawTiles(st){
  const p=W.peaks,t=W.totals;
  const tile=(l,b,s)=>`<div class="tile"><div class="lab">${l}</div><div class="big">${b}</div><div class="sub">${s}</div></div>`;
  $('tiles').innerHTML=
    tile('경과',`${W.year}<span class="sub">년</span>`,`${fmt(W.year*365+W.day)}일`)
   +tile('생존 종',`${st.specAlive}<span class="sub">/${st.specTotal}</span>`,`절멸 ${t.extinct}종`)
   +tile('누적 출생',fmt(t.births),'T3 기준')
   +tile('누적 사망',fmt(t.deaths),`포식 ${fmt(t.kills)}`)
   +tile('T3 최대',p.T3?fmt(p.T3.max):'–',p.T3?`${p.T3.maxT}년`:'')
   +tile('T3 최소',p.T3?fmt(p.T3.min):'–',p.T3?`${p.T3.minT}년`:'')
   +tile('추적 개체',fmt(st.inds),`사망 명부 ${fmt(W.dead.length)}`)
   +tile('누적 소실',`${fmt(t.burned*W.cellKm2)}<span class="sub">km²</span>`,`발화 ${fmt(t.fires)}건`);
}
function drawChron(){
  const K={fire:'화재',loss:'손실',gain:'회복',act:'개입',spec:'종'};
  $('chron').innerHTML=W.chron.slice(-80).reverse().map(e=>
    `<div><time>${e.y}년 ${String(e.d+1).padStart(3,' ')}일</time><span class="k ${e.kind}">${K[e.kind]||''}</span><span>${e.msg}</span></div>`).join('')
    ||`<div style="color:var(--ink-3)">아직 기록된 사건이 없습니다</div>`;
}

let playing=true,speed=2,acc=0,frameN=0;
function readout(){
  const st=collectStats(W);
  for(const d of GA.concat(GB)){
    const el=$('g-'+d.id); if(!el) continue;
    el.innerHTML=d.get(st)+(d.unit?`<span class="u">${d.unit}</span>`:'');
  }
  $('g-season').textContent=(st.wet?'우기':'건기')+' D−'+(st.wet?W.wetDays-W.day:365-W.day);
  for(const t of POP){
    $('g-'+t.k).textContent=fmt(st[t.k]);
    $('b-'+t.k).style.width=clamp(st[t.k]/W.cap[t.cap]*50,0,100)+'%';
  }
  /* 분해자 레이어의 색 기준. 밀도가 자릿수로 오르내리므로 실측을 따라간다. */
  if(frameN%30===0){
    const N=W.g.N, ids=W.byTier.T1; let mx=0;
    for(let j=0;j<N;j++){ if(!W.land[j]) continue;
      let t=0; for(let k=0;k<ids.length;k++) t+=W.t1d[k*N+j];
      if(t>mx) mx=t; }
    W.t1Ref=Math.max(mx*0.7,1);
  }
  /* 점 하나가 몇 마리인지를 지금 밀도에 맞춘다. 셀 평균이 세 점쯤 되게. */
  const want=Math.max(1,niceStep(st.n2/Math.max(W.landCount,1)/3));
  if(want!==t2PerDot){ t2PerDot=want; drawLegend(); }
  chip('cPio',st.pio>=3,st.pio.toFixed(1)+'×');
  chip('cFire',W.last.fires>=1,`${W.last.fires}건 · ${(W.last.burnFrac*100).toFixed(0)}%`);
  chip('cSpec',st.specAlive>=st.specTotal*0.7,`${st.specAlive}/${st.specTotal}`);
  return st;
}
const chip=(id,ok,txt)=>{const e=$(id);e.className='chip '+(ok?'ok':'no');e.querySelector('b').textContent=txt;};
/* 추적 중에는 커서 칸이 그 개체의 지금 상태를 보여 준다 */
function showSelState(){
  const i=findInd(selUid); if(!i) return;
  const ci=W.g.idx(clamp(i.x|0,0,W.g.W-1),clamp(i.y|0,0,W.g.H-1));
  const here=W.b.cnt[ci];
  $('vCursor').textContent=`${i.name} · ${indAge(W,i).toFixed(1)}년`
    +` · 에너지 ${i.e.toFixed(2)} · 수분 ${i.hyd.toFixed(2)}`
    +(i.slot>=0&&here?` · 같은 자리 ${fmt(here)}마리`:'')
    +(i.kills>=1?` · 사냥 ${fmt(i.kills)}마리`:'');
}
function frame(){
  if(playing){acc+=speed;let n=0;while(acc>=1&&n<40){stepDay(W);acc--;n++;} if(acc>2)acc=0;}
  /* 하루에 한 걸음 이하로 갈 때만 보간한다. 그보다 빠르면 프레임마다
     여러 날이 지나 버려서 이을 것이 없다. */
  dayFrac=speed<1?clamp(acc,0,1):1;
  const st=readout();
  if(follow) followSel();
  if($('mapCard').dataset.open==='true') paintMap();
  if(frameN%12===0){ drawPop(); drawSpecChart(); drawBars(); drawTiles(st); drawSpec(); drawTrail();
    drawInd(); drawLife(); if(follow) showSelState(); }
  if(chronDirty){drawChron();setChronDirty(false);}
  frameN++; requestAnimationFrame(frame);
}
$('btnPlay').onclick=e=>{playing=!playing;e.target.textContent=playing?'일시정지':'재생';e.target.setAttribute('aria-pressed',playing);};
document.querySelectorAll('[data-spd]').forEach(b=>b.onclick=()=>{speed=+b.dataset.spd;
  document.querySelectorAll('[data-spd]').forEach(o=>o.setAttribute('aria-pressed',o===b));});
$('layerSeg').onclick=e=>{const b=e.target.closest('[data-layer]');if(!b)return;layer=b.dataset.layer;
  $('layerSeg').querySelectorAll('button').forEach(o=>o.setAttribute('aria-pressed',o===b));};
$('btnMap').onclick=e=>{const c=$('mapCard'),open=c.dataset.open!=='true';
  c.dataset.open=open;e.target.setAttribute('aria-expanded',open);e.target.textContent=open?'접기':'펼치기';
  $('vCursor').textContent=open?'셀 위로 이동':'지도를 펼치세요';fitMap();};
/* 새 세계는 시작 창을 거친다 — 어떤 종을 빼고 시작할지 고르는 자리다. */
$('btnReset').onclick=()=>openStart();
$('selTier').onchange=()=>openStart({tier:$('selTier').value});
$('selClimate').onchange=()=>openStart({climate:$('selClimate').value});
/* 개체군 차트 : 보기 전환 · 등급 필터 · 시간축 확대 */
$('popTier').innerHTML=['T0','T1','T2','T3','T4','T5'].map(t=>
  `<button data-pt="${t}" aria-pressed="true">${t}</button>`).join('');
$('popMode').onclick=e=>{const b=e.target.closest('[data-pm]');if(!b)return;
  popMode=b.dataset.pm;
  $('popMode').querySelectorAll('button').forEach(o=>o.setAttribute('aria-pressed',o===b));
  drawPop();};
$('popTier').onclick=e=>{const b=e.target.closest('[data-pt]');if(!b)return;
  const t=b.dataset.pt;
  if(popTiers.has(t)) popTiers.delete(t); else popTiers.add(t);
  if(!popTiers.size) popTiers.add(t);
  b.setAttribute('aria-pressed',popTiers.has(t)); drawPop();};
$('popReset').onclick=()=>{tFrom=tTo=null; drawPop();};
{
  const svg=$('chPop');
  const tAt=ev=>{ const r=svg.getBoundingClientRect(), [a,b]=popSpan();
    const f=clamp(((ev.clientX-r.left)/r.width*720-PAD.l)/(720-PAD.l-PAD.r),0,1);
    return a+(b-a)*f; };
  svg.addEventListener('wheel',ev=>{ev.preventDefault();
    const all=W.samples; if(all.length<2) return;
    const lo=all[0].t, hi=all[all.length-1].t;
    let [a,b]=popSpan();
    const at=tAt(ev), f=ev.deltaY<0?0.75:1/0.75;
    let na=at-(at-a)*f, nb=at+(b-at)*f;
    if(nb-na<0.5){ na=at-0.25; nb=at+0.25; }
    tFrom=Math.max(lo,na); tTo=Math.min(hi,nb);
    if(tFrom<=lo&&tTo>=hi){ tFrom=tTo=null; }
    drawPop();},{passive:false});
  let pdrag=null;
  svg.addEventListener('mousedown',ev=>{pdrag={x:ev.clientX,span:popSpan()};svg.style.cursor='grabbing';});
  addEventListener('mouseup',()=>{if(pdrag){pdrag=null;svg.style.cursor='';}});
  svg.addEventListener('mousemove',ev=>{
    if(!pdrag) return;
    const all=W.samples; if(all.length<2) return;
    const r=svg.getBoundingClientRect(), [a,b]=pdrag.span;
    const d=-(ev.clientX-pdrag.x)/r.width*(b-a);
    const lo=all[0].t, hi=all[all.length-1].t;
    const w0=b-a;
    tFrom=clamp(a+d,lo,hi-w0); tTo=tFrom+w0;
    drawPop();});
  svg.addEventListener('dblclick',()=>{tFrom=tTo=null;drawPop();});
}
$('specFilter').onclick=e=>{const b=e.target.closest('[data-st]');if(!b)return;specTier=b.dataset.st;
  $('specFilter').querySelectorAll('button').forEach(o=>o.setAttribute('aria-pressed',o===b));drawSpec();};
$('tSpec').tHead.addEventListener('click',e=>{const th=e.target.closest('[data-k]');if(!th)return;
  const k=th.dataset.k; specSort=specSort.k===k?{k,dir:-specSort.dir}:{k,dir:-1}; drawSpec();});
$('tSpec').tBodies[0].addEventListener('click',e=>{const tr=e.target.closest('[data-sid]');if(!tr)return;
  selSpec=+tr.dataset.sid; drawSpec(); drawTrail();});
const segPick=(host,attr,set)=>{
  $(host).onclick=e=>{const b=e.target.closest('['+attr+']');if(!b)return;
    set(b.getAttribute(attr));
    $(host).querySelectorAll('button').forEach(o=>o.setAttribute('aria-pressed',o===b));
    drawInd();};
};
segPick('indFilter','data-live',v=>indLive=v);
segPick('indSex','data-sex',v=>indSex=v);
segPick('indLine','data-line',v=>indLine=v);
segPick('indSpec','data-spec',v=>indSpec=v==='ALL'?'ALL':+v);
$('indSearch').oninput=e=>{indQuery=e.target.value.trim();drawInd();};
$('tInd').tBodies[0].addEventListener('click',e=>{const tr=e.target.closest('[data-uid]');if(!tr)return;
  selUid=+tr.dataset.uid; drawInd(); drawLife();});
$('tInd').tHead.addEventListener('click',e=>{const th=e.target.closest('[data-k]');if(!th)return;
  const k=th.dataset.k; indSort=indSort.k===k?{k,dir:-indSort.dir}:{k,dir:-1}; drawInd();});
/* 계보를 눌러 그 개체로 건너뛴다 — 부모에서 자식으로, 짝에게로. */
$('lifeKin').addEventListener('click',e=>{const b=e.target.closest('[data-uid]');if(!b)return;
  selUid=+b.dataset.uid; drawInd(); drawLife();});
/* 계보도 : 삼각형은 펼치기, 이름은 그 개체로 건너뛰기 */
$('lifeTree').addEventListener('click',e=>{
  const t=e.target.closest('[data-tw]');
  if(t){ const u=+t.dataset.tw;
    if(treeOpen.has(u)) treeOpen.delete(u); else treeOpen.add(u);
    drawLife(); return; }
  const all=e.target.closest('[data-treeall]');
  if(all){
    const i=findInd(selUid);
    if(all.dataset.treeall==='close'){ treeOpen=new Set([selUid]); treeCut=0; }
    else if(i){
      /* 다 펼치면 후손이 수백인 개체에서 화면이 무너진다. 폭을 끊는다.
         끊었으면 그렇다고 적는다 — 후손 수와 그려진 마디가 다른 채로
         두면 계보도가 틀린 것처럼 읽힌다. */
      const LIM=400; treeOpen=new Set(); let q=[i], n=0;
      while(q.length&&n<LIM){ const x=q.shift(); treeOpen.add(x.uid); n++;
        for(const u of x.children){ const c=findInd(u); if(c) q.push(c); } }
      treeCut=q.length?LIM:0;
    }
    drawLife(); return; }
  const b=e.target.closest('[data-uid]');
  if(b){ selUid=+b.dataset.uid; drawInd(); drawLife(); }
});
/* 생애 지도의 확대 · 이동 */
{
  const lm=$('lifeMap');
  let ldrag=null;
  lm.addEventListener('wheel',ev=>{ev.preventDefault();
    const i=findInd(selUid); if(!i) return;
    const r=lm.getBoundingClientRect(), {vw,vh}=lifeView();
    const ax=lifeVx+(ev.clientX-r.left)/r.width*vw, ay=lifeVy+(ev.clientY-r.top)/r.height*vh;
    const z0=lifeZoom;
    lifeZoom=clamp(lifeZoom*(ev.deltaY<0?1.25:0.8),1,40);
    const f=z0/lifeZoom;
    lifeVx=ax-(ax-lifeVx)*f; lifeVy=ay-(ay-lifeVy)*f;
    clampLife(); paintLifeMap(i);},{passive:false});
  lm.addEventListener('mousedown',ev=>{ldrag={x:ev.clientX,y:ev.clientY,vx:lifeVx,vy:lifeVy};
    lm.style.cursor='grabbing';});
  addEventListener('mouseup',()=>{if(ldrag){ldrag=null;lm.style.cursor='';}});
  lm.addEventListener('mousemove',ev=>{
    if(!ldrag) return;
    const i=findInd(selUid); if(!i) return;
    const r=lm.getBoundingClientRect(), {vw,vh}=lifeView();
    lifeVx=ldrag.vx-(ev.clientX-ldrag.x)/r.width*vw;
    lifeVy=ldrag.vy-(ev.clientY-ldrag.y)/r.height*vh;
    clampLife(); paintLifeMap(i);});
  lm.addEventListener('dblclick',()=>{const i=findInd(selUid); if(i){ fitLife(i); paintLifeMap(i);} });
}
function toggle(btn,key,on,off,fx){btn.onclick=()=>{W[key]=!W[key];btn.setAttribute('aria-pressed',W[key]);
  logChron(W,'act',W[key]?on:off);if(W[key]&&fx)fx();};}
toggle($('iFire'),'supp','화재 전면 진압 시작 — 목본 침입 관측','화재 진압 해제');
toggle($('iPred'),'noPred','대형·소형 육식 전멸 — 초식 상한 해제','포식자 제거 유지',
  ()=>{for(const p of W.p5.concat(W.p4)) killInd(W,p,'인위적 제거'); W.p5.length=0;W.p4.length=0;});
toggle($('iRain'),'dry','강수 −40% 적용 — 건기 연장','강수 정상 복귀');
$('iImmig').onclick=()=>{W.noImmig=!W.noImmig;$('iImmig').setAttribute('aria-pressed',!W.noImmig);
  logChron(W,'act',W.noImmig?'표류 유입 차단 — 절멸은 영구다':'표류 유입 허용 — [R-12.5] 복구 경로 개방');};
/* 헤드리스 --run 과 같은 형식으로 내보낸다.
   돌리는 중에 눌러도 된다 — 그 순간까지의 기록으로 만든다. */
const stampNow=()=>new Date().toISOString().slice(0,16).replace(/[:T]/g,'').replace(/-/g,'');
function resultJson(stamp){
  const species=W.species.filter(s=>s.kind==='ANIMAL'&&!s.aggregate).map(s=>({
    name:s.name, trophic:s.trophic, massKg:+(s.massKg||0).toFixed(1),
    diet:s.diet.map(d=>W.species[d].name), droughtTol:+(s.droughtTol||0).toFixed(2),
    lifespanYr:+(s.lifespanYr||0).toFixed(1), seedN:s.seedN, finalN:Math.round(s.n),
    status:s.status, extinctYear:s.extinctYear, ...speciesTrail(s) }));
  /* 개체 표본은 최근 300마리만. 판 전체의 기록은 legacy(명예의 전당)가 들고 있다. */
  const byUid=indexByUid(W);
  const inds=W.inds.slice(-300).map(i=>indBrief(W,i,byUid));
  return { meta:{ stamp, source:'browser', seed:W.seed, tier:W.tierKey, climate:W.climateKey,
      landCells:W.landCount, years:W.year, derived:W.cap, tune:TUNE },
    years:W.years, species, legacy:hallOfFame(W), individuals:inds,
    chronicle:W.chron.map(e=>({year:e.y,day:e.d,kind:e.kind,msg:e.msg})), totals:W.totals };
}
function download(name,text,mime){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:mime}));
  a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
$('btnJson').onclick=()=>{
  const stamp=stampNow();
  download(`${stamp}_${W.tierKey}_${W.climateKey}_${W.year}년.json`,
    JSON.stringify(resultJson(stamp),null,1),'application/json');
  logChron(W,'act',`결과 내보내기 · ${W.year}년 · _결과/ 에 넣으면 읽을 수 있습니다`);
};
/* 보고서는 헤드리스 --run 이 남기는 것과 같은 서식이다(sim/11_분석서.js).
   첫 해가 끝나기 전에는 연도 표가 비어 있어 읽을 것이 없다. */
$('btnReport').onclick=()=>{
  if(!W.years.length){ logChron(W,'act','첫 해가 끝나야 보고서를 만들 수 있습니다'); return; }
  const stamp=stampNow();
  download(`${stamp}_${W.tierKey}_${W.climateKey}_${W.year}년.txt`,
    buildReport(resultJson(stamp)).join(String.fromCharCode(10))+String.fromCharCode(10),
    'text/plain;charset=utf-8');
  logChron(W,'act',`보고서 내보내기 · ${W.year}년 · 자동 판독 · 사멸 추적 · 명예의 전당`);
};
$('btnCsv').onclick=()=>{
  const cols=['year','T2','T3','T4','T5','species','grassKt','woodyPct','burnPct','fires','births','deaths'];
  const csv=[cols.join(',')].concat(W.years.map(r=>cols.map(c=>
    typeof r[c]==='number'?(Number.isInteger(r[c])?r[c]:r[c].toFixed(2)):r[c]).join(','))).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv'}));
  a.download=`island_${W.tierKey}_${W.climateKey}_${W.year}y.csv`;a.click();URL.revokeObjectURL(a.href);};
/* 화면 좌표 → 셀 좌표. 확대·이동을 거치므로 시야를 반영해야 한다. */
function cellAt(ev){
  const r=cv.getBoundingClientRect(), v=visCells();
  return [vx+(ev.clientX-r.left)/r.width*v, vy+(ev.clientY-r.top)/r.height*v];
}
let drag=null;
cv.addEventListener('mousedown',ev=>{drag={x:ev.clientX,y:ev.clientY,vx,vy,moved:false};cv.style.cursor='grabbing';});
addEventListener('mouseup',ev=>{
  if(drag&&!drag.moved) pickAt(...cellAt(ev));   // 끌지 않고 눌렀으면 선택이다
  if(drag){drag=null;cv.style.cursor='';}});
cv.addEventListener('wheel',ev=>{ev.preventDefault();
  const [cx,cy]=cellAt(ev); setZoom(zoom*(ev.deltaY<0?1.25:0.8),cx,cy);},{passive:false});
cv.addEventListener('dblclick',()=>{zoom=1;vx=vy=0;zoomMeta();});
cv.addEventListener('mousemove',ev=>{
  const g=W.g;
  if(drag){ const r=cv.getBoundingClientRect(), v=visCells();
    if(Math.abs(ev.clientX-drag.x)+Math.abs(ev.clientY-drag.y)>3) drag.moved=true;
    if(!drag.moved) return;
    setFollow(false);                                  // 손으로 옮기면 추적을 놓는다
    vx=drag.vx-(ev.clientX-drag.x)/r.width*v; vy=drag.vy-(ev.clientY-drag.y)/r.height*v;
    clampView(); return; }
  const [fx,fy]=cellAt(ev), x=Math.floor(fx), y=Math.floor(fy);
  if(!g.inside(x,y))return;
  const i=g.idx(x,y);
  if(!W.land[i]){ $('vCursor').textContent='해상'; return; }
  /* 이 셀에 무엇이 있는지 등급별로 실제 값을 보여 준다 — 점의 기준을 눈으로 확인하는 자리 */
  let t2=0; for(const id of W.byTier.T2){ const o=W.t2Idx.get(id); if(o!==undefined) t2+=W.t2d[o*W.g.N+i]; }
  const hn=W.b.cnt[i]||0;
  const pc=W.p4.filter(p=>W.g.idx(p.x|0,p.y|0)===i).length+W.p5.filter(p=>W.g.idx(p.x|0,p.y|0)===i).length;
  $('vCursor').textContent=`${W.elev[i]|0}m · 초본 ${W.grass[i].toFixed(1)}t · 수분 ${W.soil[i].toFixed(0)}mm`
     +(W.water[i]===2?' · 항구수원':W.water[i]===1?' · 계절수원':'')
     +` │ T2 ${fmt(t2)}마리 · 대형초식 ${fmt(hn)}마리 · 육식 ${pc}`;});
cv.addEventListener('mouseleave',()=>{$('vCursor').textContent='셀 위로 이동';drag=null;});
$('zoomSeg').onclick=e=>{const b=e.target.closest('[data-z]');if(!b)return;
  if(b.dataset.z==='in') setZoom(zoom*1.6);
  else if(b.dataset.z==='out') setZoom(zoom/1.6);
  else {setFollow(false);zoom=1;vx=vy=0;zoomMeta();}};
$('dotSeg').onclick=e=>{const b=e.target.closest('[data-dot]');if(!b)return;
  dotMode=b.dataset.dot;
  $('dotSeg').querySelectorAll('button').forEach(o=>o.setAttribute('aria-pressed',o===b));
  drawLegend();};
$('btnContour').onclick=e=>{
  showContour=!showContour; e.target.setAttribute('aria-pressed',showContour);};
$('btnRegion').onclick=e=>{
  showRegion=!showRegion; e.target.setAttribute('aria-pressed',showRegion); drawInd(); drawLife();};
$('btnFollow').onclick=()=>{
  if(!findInd(selUid)){ $('vCursor').textContent='먼저 개체를 고르세요 — 지도를 누르거나 표에서 선택'; return; }
  setFollow(!follow); if(follow){ followSel(); zoomMeta(); }};
addEventListener('resize',fitMap);

/* ── 시작 창 ────────────────────────────────────────────────────────
   같은 시드 · 같은 지형에서 종 구성만 바꿔 세우기 위한 자리.
   로스터는 시드에서 결정론적으로 나오므로, 세계를 만들기 전에 미리 뽑아
   목록을 보여 줄 수 있다. */
const TIER_ORDER=['T0','T1','T2','T3','T4','T5'];
const TIER_NAME={T0:'T0 식물',T1:'T1 분해자',T2:'T2 소형초식',T3:'T3 대형초식',
                 T4:'T4 소형육식',T5:'T5 대형육식'};
let startRoster=null, startOff=new Set();
$('startTier').innerHTML=$('selTier').innerHTML;
$('startClimate').innerHTML=$('selClimate').innerHTML;
function previewRoster(){
  const seed=+$('startSeed').value||0, tier=$('startTier').value, climate=$('startClimate').value;
  const cap=deriveCapacity(tier,climate);
  startRoster=buildRoster(tier,climate,cap,mulberry32(seed^0x1B873593));
  const R=startRoster;
  $('startMeta').textContent=`시드 ${seed} · ${ISLAND_TIERS[tier].areaKm2.toLocaleString('ko-KR')}km²`
    +` · 계획 ${R.totalPlanned}종 · 유도 T3 ${fmt(cap.T3)}`;
  $('startList').innerHTML=TIER_ORDER.map(t=>{
    const ids=R.byTier[t]||[];
    if(!ids.length) return '';
    return `<div class="tierBlock"><b style="color:var(${TIER_VAR[t]||'--ink-2'})">${TIER_NAME[t]}</b>
      <div class="spList">`+ids.map(id=>{
        const sp=R.species[id];
        const plant=sp.kind==='PLANT', absent=sp.status==='ABSENT';
        const lock=plant||sp.aggregate||absent;
        const note=absent?'결번':plant?'식물':sp.aggregate?'집계'
          :`${fmt(sp.seedN)}마리 · ${sp.massKg.toFixed(1)}kg`;
        return `<label class="spItem${lock?' off':''}">
          <input type="checkbox" data-sp="${sp.name}"${lock?' disabled':''}
            ${lock||!startOff.has(sp.name)?' checked':''}>
          <span>${sp.name}</span><small>${note}</small></label>`;
      }).join('')+`</div></div>`;
  }).join('');
}
function openStart(pre){
  if(pre&&pre.tier) $('startTier').value=pre.tier;
  if(pre&&pre.climate) $('startClimate').value=pre.climate;
  if(!$('startSeed').value) $('startSeed').value=String((Math.random()*1e9)|0);
  startOff.clear();
  previewRoster();
  $('startWrap').hidden=false;
}
$('startSeed').oninput=previewRoster;
$('startTier').onchange=previewRoster;
$('startClimate').onchange=previewRoster;
$('startRoll').onclick=()=>{$('startSeed').value=String((Math.random()*1e9)|0);previewRoster();};
$('startList').addEventListener('change',e=>{
  const b=e.target.closest('[data-sp]'); if(!b) return;
  if(b.checked) startOff.delete(b.dataset.sp); else startOff.add(b.dataset.sp);
});
const setAll=on=>{
  startOff.clear();
  $('startList').querySelectorAll('[data-sp]:not([disabled])').forEach(b=>{
    b.checked=on; if(!on) startOff.add(b.dataset.sp);
  });
};
$('startAll').onclick=()=>setAll(true);
$('startNone').onclick=()=>setAll(false);
$('startGo').onclick=()=>{
  const seed=+$('startSeed').value||0, tier=$('startTier').value, climate=$('startClimate').value;
  $('selTier').value=tier; $('selClimate').value=climate;
  $('startWrap').hidden=true;
  newWorld(seed,tier,climate,{exclude:[...startOff]});
  if(startOff.size) logChron(W,'act',`시작 구성에서 ${startOff.size}종 제외 — ${[...startOff].slice(0,3).join(' · ')}${startOff.size>3?' 외':''}`);
};

$('startSeed').value='20260812';
/* 기본 무대는 L(1,000km²)이다. XL(10,000km²)은 개체가 22만을 넘어
   같은 하루가 15배 비싸다 — 고르면 돌아가지만, 열자마자 그 값을 치를
   이유는 없다. */
newWorld(20260812,'L','SAVANNA');
frame();
}
