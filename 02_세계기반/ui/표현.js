/* 섬 생태 시뮬레이터 — 표현 계층 — DOM은 여기서만 만진다
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

import { CLIMATE_PROFILES, ISLAND_TIERS, ECO, TUNE, clamp, lerp, mulberry32,
         createWorld, stepDay, collectStats, viability, indAge,
         deriveCapacity, buildRoster,
         hallOfFame, indBrief, buildReport, speciesTrail, SPEC_EVENTS, attachInd,
         logChron, chronDirty, setChronDirty } from '../sim/index.js';


export function boot(){
const $=id=>document.getElementById(id);
const fmt=n=>Math.round(n).toLocaleString('ko-KR');
const varCache={};
const cssVar=n=>varCache[n]??=getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const TIER_VAR={T0:'--t0',T1:'--t1',T2:'--t2',T3:'--t3',T4:'--t4',T5:'--t5'};

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
};
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
/* 대형 초식은 개체다. 점 하나가 한 마리이고 그 좌표는 진짜다.
   다만 수만 마리를 다 찍으면 화면이 뭉개지므로 넓게 볼 때는 솎는다. */
const SCATTER_BUDGET=6000;
let scatterNote='';
const NICE=[1,2,5,10,25,50,100,250,500,1000,2500,5000,10000];
const niceStep=v=>{let o=NICE[0];for(const n of NICE) if(n<=v) o=n; return o;};
let t2PerDot=200, scatterShown='';
function drawLegend(){
  $('legend').innerHTML=`<div class="lg"><span class="ramp"></span><span>초본 0 → 부양력</span></div>`
  +`<div class="lg"><span class="sw" style="background:var(--t2)"></span>T2 점 1개 = ${fmt(t2PerDot)}마리 · 밀도장(개체 아님)</div>`
  +`<div class="lg"><span class="sw" style="background:var(--t3)"></span>${scatterShown||'T3 점 1개 = 개체 하나'}
     <span style="color:var(--ink-3)">— 무리는 객체가 아니라 모인 결과입니다</span></div>`
  +`<div class="lg"><span class="sw" style="background:var(--t4)"></span>T4 점 1개 = 개체 하나</div>`
  +`<div class="lg"><span class="sw" style="background:var(--t5)"></span>T5 점 1개 = 개체 하나</div>`
  +`<div class="lg"><span class="sw" style="background:var(--water);border-radius:1px"></span>수원
    <span class="sw" style="background:var(--fire);border-radius:1px;margin-left:6px"></span>화재</div>
   <div class="lg" style="color:var(--ink-3)">휠 확대 · 끌어 이동 · 더블클릭 초기화</div>
   <div class="lg" style="color:var(--ink-3)">선택 개체는 흰 테두리와 동선으로 표시</div>`;
}
drawLegend();
$('selTier').innerHTML=Object.entries(ISLAND_TIERS).map(([k,v])=>
  `<option value="${k}"${k==='XL'?' selected':''}>${v.name} · ${v.areaKm2.toLocaleString('ko-KR')}km²</option>`).join('');
$('selClimate').innerHTML=Object.entries(CLIMATE_PROFILES).map(([k,v])=>
  `<option value="${k}"${k==='SAVANNA'?' selected':''}>${v.name}</option>`).join('');

const cv=$('map'), ctx=cv.getContext('2d',{alpha:false});
const off=document.createElement('canvas'); let octx,img,W=null;
let selUid=null, specTier='ALL', indLive='all', indQuery='';

function newWorld(seed,tier,climate,opts){
  W=createWorld(seed,tier,climate,opts||{});
  off.width=W.g.W; off.height=W.g.H;
  octx=off.getContext('2d'); img=octx.createImageData(W.g.W,W.g.H);
  cv.width=cv.height=Math.min(900,W.g.W*9);
  chronDirty=true; selUid=null; zoom=1; vx=vy=0; zoomMeta();
  $('brandSub').textContent=`${W.T.name} ${W.T.areaKm2.toLocaleString('ko-KR')}km² · ${W.C.name} · 격자 ${W.T.cellM}m`;
  $('mapMeta').textContent=`${W.g.W}×${W.g.H} 셀 · 육지 ${fmt(W.landCount)}`;
  const c=W.cap;
  $('histMeta').textContent=`유도 부양력 T1 ${fmt(c.T1)} · T2 ${fmt(c.T2)} · T3 ${fmt(c.T3)}`
    +` · T4 ${fmt(c.T4)} · T5 ${fmt(c.T5)}`;
  const ab=W.species.filter(s=>s.status==='ABSENT').length;
  $('specMeta').textContent=`[I-6.4] 계획 ${W.totalPlanned}종 · 결번 ${ab}종 · 식물 시뮬 ${W.simPlants.length}종`;
  $('specFilter').innerHTML=['ALL','T0','T2','T3','T4','T5'].map((t,i)=>
    `<button data-st="${t}"${i===0?' aria-pressed="true"':''}>${t==='ALL'?'전체':t}</button>`).join('');
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
  const seen=(x,y,pad)=>x>=vx-pad&&x<=vx+v+pad&&y>=vy-pad&&y<=vy+v+pad;
  /* 확대하면 셀 하나가 넓어지므로 점을 더 뿌려도 뭉치지 않는다.
     기준은 그대로 1점 = T2_PER_DOT 마리다(범례에 적어 둔 값). */
  const dotMax=Math.min(8,Math.max(2,Math.round(zoom*2)));
  ctx.fillStyle=cssVar('--t2'); ctx.globalAlpha=.5;
  const x0=Math.max(0,vx|0), x1=Math.min(g.W-1,Math.ceil(vx+v)), y0=Math.max(0,vy|0), y1=Math.min(g.H-1,Math.ceil(vy+v));
  const dotPx=Math.max(1.2,Math.min(4,1.6*Math.sqrt(zoom)));
  for(const id of W.byTier.T2){
    if(W.species[id].status==='ABSENT') continue;
    const o=W.t2Idx.get(id)*N;
    for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
      const i=g.idx(xx,yy);
      if(!W.land[i]) continue;
      const k=Math.min(dotMax,W.t2d[o+i]/t2PerDot|0);
      for(let m=0;m<k;m++){
        const hx=((i*2654435761+m*40503+id*7919)>>>8&255)/255, hy=((i*1597334677+m*22695+id*104729)>>>8&255)/255;
        ctx.fillRect(SX(xx+hx),SY(yy+hy),dotPx,dotPx);
      }
    }
  }
  ctx.globalAlpha=1; ctx.lineWidth=1; ctx.strokeStyle='rgba(20,24,18,.55)';
  const rz=Math.min(2.5,Math.sqrt(zoom));
  ctx.fillStyle=cssVar('--t4');
  for(const p of W.p4){ if(!seen(p.x,p.y,1)) continue;
    ctx.beginPath();ctx.arc(SX(IX(p)),SY(IY(p)),2*rz,0,6.2832);ctx.fill();ctx.stroke();}
  /* T3 : 이제 무리라는 객체가 없다. 점 하나가 개체 하나다.
     다 그리면 수만 개라 화면이 뭉개지므로, 넓게 볼 때는 솎아 그리고
     솎은 비율을 범례에 적는다. 확대하면 한 마리씩 다 보인다. */
  ctx.fillStyle=cssVar('--t3');
  {
    const visible=[];
    for(const a of W.ani) if(seen(a.x,a.y,1)) visible.push(a);
    const per=Math.min(1,SCATTER_BUDGET/Math.max(visible.length,1));
    const stride=Math.max(1,Math.round(1/per));
    scatterNote=stride<=1?'점 1개 = 개체 하나'
      :`점 1개 = 개체 하나 · ${stride}마리 중 1마리만 표시(예산)`;
    const rDot=Math.max(1.1,1.4*rz);
    for(let k=0;k<visible.length;k+=stride){
      const a=visible[k];
      ctx.beginPath();ctx.arc(SX(IX(a)),SY(IY(a)),rDot,0,6.2832);ctx.fill();
    }
  }
  ctx.fillStyle=cssVar('--t5'); ctx.strokeStyle='rgba(255,255,255,.7)';
  for(const p of W.p5){ if(!seen(p.x,p.y,1)) continue;
    ctx.beginPath();ctx.arc(SX(IX(p)),SY(IY(p)),3*rz,0,6.2832);ctx.fill();ctx.stroke();}
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
  let bestAni=null, ad=bd;
  for(const a of W.ani){
    const dx=IX(a)-fx, dy=IY(a)-fy, d=dx*dx+dy*dy;
    if(d<ad){ ad=d; bestAni=a; }
  }
  if(bestAni&&ad<=bd){ best=bestAni.ind||attachInd(W,bestAni); bd=ad; }
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
const SPEC_COLS=[['name','종',s=>s.name,'nm'],['trophic','등급',s=>s.trophic,'nm'],
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
  ['kills','사냥',(w,i)=>i.kills>=1?fmt(i.kills):'–','',(w,i)=>i.kills],
  ['peakHerd','최대무리',(w,i)=>i.peakHerd>=1?fmt(i.peakHerd):'–','',(w,i)=>i.peakHerd],
  ['state','상태',(w,i)=>i.deathDay==null?'<span class="st ok">생존</span>'
    :`<span class="st ${i.fate==='merge'?'warn':'no'}">${i.cause}</span>`,'',
    (w,i)=>i.deathDay==null?2:i.fate==='merge'?1:0],
  ['ev','사건',(w,i)=>i.ev.length,'',(w,i)=>i.ev.length]];
function allInds(){
  let a=W.inds;
  if(indLive==='alive') a=a.filter(i=>i.deathDay==null);
  else if(indLive==='dead') a=a.filter(i=>i.deathDay!=null&&i.fate!=='merge');
  if(indQuery){ const q=indQuery.toLowerCase();
    a=a.filter(i=>i.name.toLowerCase().includes(q)||W.species[i.sp].name.toLowerCase().includes(q)); }
  const col=IND_COLS.find(c=>c[0]===indSort.k)||IND_COLS[4], key=col[4], d=indSort.dir;
  return a.slice().sort((x,y)=>{
    const av=key(W,x), bv=key(W,y);
    return (typeof av==='string'?av.localeCompare(bv):av-bv)*d || (y.uid-x.uid);
  }).slice(0,300);
}
const findInd=uid=>uid==null?null:W.inds.find(i=>i.uid===uid);
function drawInd(){
  const rows=allInds();
  const alive=W.inds.reduce((s,i)=>s+(i.deathDay==null?1:0),0);
  $('indMeta').textContent=`전체 ${fmt(W.inds.length)} · 생존 ${fmt(alive)}`
    +` · 표시 ${fmt(rows.length)}(상위 300) · 정렬 ${(IND_COLS.find(c=>c[0]===indSort.k)||[])[1]||''}`;
  $('tInd').tHead.innerHTML='<tr>'+IND_COLS.map(c=>
    `<th data-k="${c[0]}">${c[1]}${indSort.k===c[0]?(indSort.dir>0?' ▲':' ▼'):''}</th>`).join('')+'</tr>';
  $('tInd').tBodies[0].innerHTML=rows.length?rows.map(i=>
    `<tr data-uid="${i.uid}"${i.uid===selUid?' aria-selected="true"':''}>`
    +IND_COLS.map(c=>`<td class="${c[3]||''}">${c[2](W,i)}</td>`).join('')+'</tr>').join('')
    :`<tr><td colspan="${IND_COLS.length}" style="text-align:left;color:var(--ink-3)">해당 개체가 없습니다</td></tr>`;
}
const EV_LABEL={birth:'탄생',death:'사망',hunt:'사냥',breed:'번식',move:'이동',fire:'화재'};
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
      <th>연차</th><th>개체수</th><th>출생</th><th>사망</th><th>피식</th>
      <th>서식%</th><th>최대군집</th><th>평균나이</th></tr></thead><tbody>`
    +rows.map(r=>`<tr><td>${r.year}</td><td>${fmt(r.n)}</td><td>${fmt(r.born)}</td>`
      +`<td>${fmt(r.died)}</td><td>${fmt(r.eaten)}</td><td>${r.rangePct.toFixed(0)}</td>`
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
/* 계보 : 부모 · 짝 · 자식. 눌러서 그 개체로 건너뛴다. */
function kinChips(i){
  const one=uid=>{
    const k=findInd(uid); if(!k) return '';
    const sp=W.species[k.sp];
    return `<button class="kin" data-uid="${uid}" title="${sp.name}">`
      +`${k.name}${k.deathDay!=null?' †':''}</button>`;
  };
  const rows=[];
  const par=[i.parent,i.parent2].filter(u=>u!=null&&findInd(u)).map(one).join('');
  if(par) rows.push(`<dt>부모</dt><dd class="kinbox">${par}</dd>`);
  const mates=i.mates.map(one).filter(Boolean);
  if(mates.length) rows.push(`<dt>짝 ${mates.length}</dt><dd class="kinbox">${mates.join('')}</dd>`);
  const kids=i.children.map(one).filter(Boolean);
  if(kids.length) rows.push(`<dt>자식 ${i.offspring}</dt><dd class="kinbox">${kids.join('')}`
    +(i.offspring>kids.length?`<span style="color:var(--ink-3);font-size:10px">외 ${i.offspring-kids.length}</span>`:'')+`</dd>`);
  if(!rows.length) return `<dl class="meta"><dt>계보</dt><dd style="color:var(--ink-3)">기록된 혈연이 없습니다</dd></dl>`;
  return `<dl class="meta">${rows.join('')}</dl>`;
}
function drawLife(){
  const i=findInd(selUid);
  if(!i){
    $('lifeHead').innerHTML='<p style="color:var(--ink-3);font-size:11px;margin:0">왼쪽에서 개체를 고르면 생애가 표시됩니다.</p>';
    $('lifeMapWrap').hidden=true; $('lifeKin').innerHTML=''; $('lifeTl').innerHTML='';
    lifeFor=null; return;
  }
  const sp=W.species[i.sp], age=indAge(W,i);
  if(lifeFor!==i.uid){ lifeFor=i.uid; fitLife(i); }
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
      <dt>체중</dt><dd>${sp.massKg.toFixed(1)} kg</dd>
      <dt>에너지</dt><dd>${i.e.toFixed(2)} · 수분 ${i.hyd.toFixed(2)}</dd>
      ${i.kills>=1?`<dt>사냥</dt><dd>${fmt(i.kills)}마리</dd>`:''}
      ${i.peakHerd>=1?`<dt>최대 무리</dt><dd>${fmt(i.peakHerd)}마리</dd>`:''}
    </dl>`;
  $('lifeMapWrap').hidden=false;
  paintLifeMap(i);
  $('lifeKin').innerHTML=kinChips(i);
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
  const lst=W.aniAt[ci];
  $('vCursor').textContent=`${i.name} · ${indAge(W,i).toFixed(1)}년`
    +` · 에너지 ${i.e.toFixed(2)} · 수분 ${i.hyd.toFixed(2)}`
    +(i.animal&&lst?` · 같은 자리 ${fmt(lst.length)}마리`:'')
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
$('indFilter').onclick=e=>{const b=e.target.closest('[data-live]');if(!b)return;indLive=b.dataset.live;
  $('indFilter').querySelectorAll('button').forEach(o=>o.setAttribute('aria-pressed',o===b));drawInd();};
$('indSearch').oninput=e=>{indQuery=e.target.value.trim();drawInd();};
$('tInd').tBodies[0].addEventListener('click',e=>{const tr=e.target.closest('[data-uid]');if(!tr)return;
  selUid=+tr.dataset.uid; drawInd(); drawLife();});
$('tInd').tHead.addEventListener('click',e=>{const th=e.target.closest('[data-k]');if(!th)return;
  const k=th.dataset.k; indSort=indSort.k===k?{k,dir:-indSort.dir}:{k,dir:-1}; drawInd();});
/* 계보를 눌러 그 개체로 건너뛴다 — 부모에서 자식으로, 짝에게로. */
$('lifeKin').addEventListener('click',e=>{const b=e.target.closest('[data-uid]');if(!b)return;
  selUid=+b.dataset.uid; drawInd(); drawLife();});
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
    name:s.name, trophic:s.trophic, massKg:+s.massKg.toFixed(1),
    diet:s.diet.map(d=>W.species[d].name), droughtTol:+s.droughtTol.toFixed(2),
    lifespanYr:+s.lifespanYr.toFixed(1), seedN:s.seedN, finalN:Math.round(s.n),
    status:s.status, extinctYear:s.extinctYear, ...speciesTrail(s) }));
  /* 개체 표본은 최근 300마리만. 판 전체의 기록은 legacy(명예의 전당)가 들고 있다. */
  const inds=W.inds.slice(-300).map(i=>indBrief(W,i));
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
  const lst=W.aniAt[i], hn=lst?lst.length:0;
  const pc=W.p4.filter(p=>W.g.idx(p.x|0,p.y|0)===i).length+W.p5.filter(p=>W.g.idx(p.x|0,p.y|0)===i).length;
  $('vCursor').textContent=`${W.elev[i]|0}m · 초본 ${W.grass[i].toFixed(1)}t · 수분 ${W.soil[i].toFixed(0)}mm`
     +(W.water[i]===2?' · 항구수원':W.water[i]===1?' · 계절수원':'')
     +` │ T2 ${fmt(t2)}마리 · 대형초식 ${fmt(hn)}마리 · 육식 ${pc}`;});
cv.addEventListener('mouseleave',()=>{$('vCursor').textContent='셀 위로 이동';drag=null;});
$('zoomSeg').onclick=e=>{const b=e.target.closest('[data-z]');if(!b)return;
  if(b.dataset.z==='in') setZoom(zoom*1.6);
  else if(b.dataset.z==='out') setZoom(zoom/1.6);
  else {setFollow(false);zoom=1;vx=vy=0;zoomMeta();}};
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
newWorld(20260812,'XL','SAVANNA');
frame();
}
