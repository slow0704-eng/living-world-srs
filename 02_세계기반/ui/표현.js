/* 섬 생태 시뮬레이터 — 표현 계층 — DOM은 여기서만 만진다
   소스는 이 모듈이고, 32_사바나XL_생태시뮬.html 은 `node 빌드.mjs` 산출물이다. */

import { CLIMATE_PROFILES, ISLAND_TIERS, ECO, TUNE, clamp, lerp,
         createWorld, stepDay, collectStats, viability, indAge,
         hallOfFame, indBrief, buildReport,
         logChron, chronDirty, setChronDirty } from '../sim/index.js';


export function boot(){
const $=id=>document.getElementById(id);
const fmt=n=>Math.round(n).toLocaleString('ko-KR');
const varCache={};
const cssVar=n=>varCache[n]??=getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const TIER_VAR={T0:'--t0',T2:'--t2',T3:'--t3',T4:'--t4',T5:'--t5'};

const GA=[{id:'year',lab:'경과',unit:'년',get:s=>s.year},{id:'day',lab:'일차',get:s=>s.day+1},
  {id:'season',lab:'계절',txt:true,get:s=>s.wet?'우기':'건기'},
  {id:'temp',lab:'기온',unit:'°C',get:s=>s.tempC.toFixed(1)},
  {id:'rain',lab:'당일 강수',unit:'mm',get:s=>s.rainMm.toFixed(1)},
  {id:'soil',lab:'토양수분',unit:'mm',get:s=>Math.round(s.soilMm)},
  {id:'wcell',lab:'가용 수원',unit:'셀',get:s=>fmt(s.waterCells)}];
const GB=[{id:'grass',lab:'초본 현존량',unit:'천t',get:s=>fmt(s.grassT/1000)},
  {id:'woody',lab:'목본 임관',unit:'%',get:s=>Math.round(s.woodyFrac*100)},
  {id:'fire',lab:'연소 중',unit:'셀',get:s=>s.burning},
  {id:'herds',lab:'무리 수',get:s=>fmt(s.herds)},
  {id:'energy',lab:'T3 에너지',get:s=>s.energy.toFixed(2)},
  {id:'inds',lab:'추적 개체',get:s=>fmt(s.inds)}];
const POP=[{k:'n2',cap:'T2',lab:'T2 소형초식'},{k:'n3',cap:'T3',lab:'T3 대형초식'},
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
const NICE=[1,2,5,10,25,50,100,250,500,1000,2500,5000,10000];
const niceStep=v=>{let o=NICE[0];for(const n of NICE) if(n<=v) o=n; return o;};
let t2PerDot=200;
function drawLegend(){
  $('legend').innerHTML=`<div class="lg"><span class="ramp"></span><span>초본 0 → 부양력</span></div>`
  +`<div class="lg"><span class="sw" style="background:var(--t2)"></span>T2 점 1개 = ${fmt(t2PerDot)}마리 · 밀도장(개체 아님)</div>`
  +`<div class="lg"><span class="sw" style="background:var(--t3)"></span>T3 점 1개 = 무리 하나 · 크기 = √개체수</div>`
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

function newWorld(seed,tier,climate){
  W=createWorld(seed,tier,climate);
  off.width=W.g.W; off.height=W.g.H;
  octx=off.getContext('2d'); img=octx.createImageData(W.g.W,W.g.H);
  cv.width=cv.height=Math.min(900,W.g.W*9);
  chronDirty=true; selUid=null; zoom=1; vx=vy=0; zoomMeta();
  $('brandSub').textContent=`${W.T.name} ${W.T.areaKm2.toLocaleString('ko-KR')}km² · ${W.C.name} · 격자 ${W.T.cellM}m`;
  $('mapMeta').textContent=`${W.g.W}×${W.g.H} 셀 · 육지 ${fmt(W.landCount)}`;
  const c=W.cap;
  $('histMeta').textContent=`유도 부양력 T2 ${fmt(c.T2)} · T3 ${fmt(c.T3)} · T4 ${fmt(c.T4)} · T5 ${fmt(c.T5)}`;
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
const px=[0,0,0];
function paintMap(){
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
  ctx.fillStyle=cssVar('--t4');
  for(const p of W.p4){ if(!seen(p.x,p.y,1)) continue;
    ctx.beginPath();ctx.arc(SX(p.x),SY(p.y),2*Math.min(2.5,Math.sqrt(zoom)),0,6.2832);ctx.fill();ctx.stroke();}
  ctx.fillStyle=cssVar('--t3');
  for(const h of W.herds){ if(!seen(h.x,h.y,2)) continue;
    ctx.beginPath();ctx.arc(SX(h.x),SY(h.y),Math.max(1.8,Math.sqrt(h.n)*0.62)*Math.min(2.5,Math.sqrt(zoom)),0,6.2832);ctx.fill();ctx.stroke();}
  ctx.fillStyle=cssVar('--t5'); ctx.strokeStyle='rgba(255,255,255,.7)';
  for(const p of W.p5){ if(!seen(p.x,p.y,1)) continue;
    ctx.beginPath();ctx.arc(SX(p.x),SY(p.y),3*Math.min(2.5,Math.sqrt(zoom)),0,6.2832);ctx.fill();ctx.stroke();}
  const sel=findInd(selUid);
  if(sel&&sel.deathDay==null&&sel.track.length>1){
    ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=1.6; ctx.beginPath();
    sel.track.forEach((p,i)=>i?ctx.lineTo(SX(p[1]),SY(p[2])):ctx.moveTo(SX(p[1]),SY(p[2])));
    ctx.stroke();
    ctx.beginPath(); ctx.arc(SX(sel.x),SY(sel.y),6,0,6.2832); ctx.stroke();
  }
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
function drawPop(){
  const svg=$('chPop'),Wd=720,Ht=190,s=W.samples;
  if(s.length<2){svg.innerHTML='';return;}
  const t0=s[0].t,t1=Math.max(s[s.length-1].t,t0+.01);
  const ser=POP.map(t=>({...t,pts:s.map(p=>[p.t,p[t.cap]/Math.max(W.cap[t.cap],1)*100])}));
  let max=100; for(const e of ser) for(const p of e.pts) if(p[1]>max) max=p[1];
  max=Math.ceil(max/25)*25;
  const X=v=>PAD.l+(v-t0)/(t1-t0)*(Wd-PAD.l-PAD.r), Y=v=>Ht-PAD.b-clamp(v/max,0,1)*(Ht-PAD.t-PAD.b);
  svg.innerHTML=ticks(max,4).map(v=>
    `<line x1="${PAD.l}" x2="${Wd-PAD.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--grid)"/>
     <text x="${PAD.l-7}" y="${(Y(v)+3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--ink-3)">${v}%</text>`).join('')
   +`<line x1="${PAD.l}" x2="${Wd-PAD.r}" y1="${Y(100).toFixed(1)}" y2="${Y(100).toFixed(1)}" stroke="var(--ink-3)" stroke-dasharray="3 3" opacity=".7"/>`
   +ser.map(e=>`<path d="${path(e.pts,X,Y)}" fill="none" stroke="var(${TIER_VAR[e.cap]})" stroke-width="2" stroke-linejoin="round"/>`).join('')
   +ser.map(e=>{const p=e.pts[e.pts.length-1];
     return `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3" fill="var(${TIER_VAR[e.cap]})" stroke="var(--panel)" stroke-width="2"/>
     <text x="${(X(p[0])+7).toFixed(1)}" y="${(Y(p[1])+3.5).toFixed(1)}" font-size="10" font-weight="600" fill="var(${TIER_VAR[e.cap]})">${e.cap}</text>`;}).join('')
   +`<text x="${PAD.l}" y="${Ht-5}" font-size="9.5" fill="var(--ink-3)">${t0.toFixed(0)}년</text>
     <text x="${Wd-PAD.r}" y="${Ht-5}" font-size="9.5" fill="var(--ink-3)" text-anchor="end">${t1.toFixed(1)}년</text>`;
  $('legPop').innerHTML=POP.map(t=>`<span style="color:var(${TIER_VAR[t.cap]})"><i></i>${t.lab}</span>`).join('')
    +`<span style="color:var(--ink-3)">┈ 100% = [I-4] 유도 부양력</span>`;
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
let specSort={k:'n',dir:-1};
const SPEC_COLS=[['name','종',s=>s.name,'nm'],['trophic','등급',s=>s.trophic,'nm'],
  ['massKg','체중 kg',s=>s.massKg?s.massKg.toFixed(1):'–'],
  ['diet','식이폭',s=>s.diet?s.diet.length:'–'],
  ['droughtTol','내건성',s=>s.droughtTol!=null?s.droughtTol.toFixed(2):'–'],
  ['lifespanYr','수명 년',s=>s.lifespanYr?s.lifespanYr.toFixed(0):'–'],
  ['seedN','초기',s=>s.seedN!=null?fmt(s.seedN):'–'],
  ['n','현재',s=>s.kind==='PLANT'||s.aggregate?'–':fmt(s.n)],
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
  $('tSpec').tBodies[0].innerHTML=rows.map(s=>'<tr>'+SPEC_COLS.map(c=>
    `<td class="${c[3]||''}">${c[2](s)}</td>`).join('')+'</tr>').join('');
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
  ['born','출생',(w,i)=>(i.bornDay/365).toFixed(1),'',(w,i)=>i.bornDay],
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
function drawLife(){
  const i=findInd(selUid);
  if(!i){$('life').innerHTML='<p style="color:var(--ink-3);font-size:11px;margin:0">왼쪽에서 개체를 고르면 생애가 표시됩니다.</p>';return;}
  const sp=W.species[i.sp], age=indAge(W,i);
  const tr=i.track;
  let trackSvg='';
  if(tr.length>1){
    const xs=tr.map(p=>p[1]),ys=tr.map(p=>p[2]);
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
    const pad=Math.max(2,(Math.max(x1-x0,y1-y0))*0.15);
    const sx=v=>((v-x0+pad)/((x1-x0)+2*pad))*140, sy=v=>((v-y0+pad)/((y1-y0)+2*pad))*100;
    const km=(x1-x0)*W.cellKm, kmY=(y1-y0)*W.cellKm;
    trackSvg=`<div><div class="lab" style="margin-bottom:4px">동선 · 최근 ${tr.length}점 (${Math.max(km,kmY).toFixed(1)} km 범위)</div>
      <svg id="trackSvg" viewBox="0 0 140 100" role="img" aria-label="개체 동선">
        <path d="${tr.map((p,k)=>(k?'L':'M')+sx(p[1]).toFixed(1)+' '+sy(p[2]).toFixed(1)).join('')}"
          fill="none" stroke="var(${TIER_VAR[sp.trophic]||'--ink-2'})" stroke-width="1.4" stroke-linejoin="round" opacity=".85"/>
        <circle cx="${sx(tr[0][1]).toFixed(1)}" cy="${sy(tr[0][2]).toFixed(1)}" r="2.4" fill="var(--good)"/>
        <circle cx="${sx(tr[tr.length-1][1]).toFixed(1)}" cy="${sy(tr[tr.length-1][2]).toFixed(1)}" r="2.4" fill="var(--crit)"/>
      </svg></div>`;
  }
  $('life').innerHTML=`
    <div class="hd"><b>${i.name}</b>
      <span class="chip" style="border-color:var(${TIER_VAR[sp.trophic]});color:var(${TIER_VAR[sp.trophic]})">${sp.trophic} ${sp.name}</span>
      ${i.deathDay==null?'<span class="chip ok">생존</span>'
        :`<span class="chip ${i.fate==='merge'?'':'no'}">${i.cause}</span>`}</div>
    <dl class="meta">
      <dt>성별</dt><dd>${i.sex==='M'?'수':'암'}</dd>
      <dt>나이</dt><dd>${age.toFixed(1)}년 / 수명 ${sp.lifespanYr.toFixed(0)}년</dd>
      <dt>출생</dt><dd>${(i.bornDay/365).toFixed(1)}년차</dd>
      ${i.deathDay!=null?`<dt>사망</dt><dd>${(i.deathDay/365).toFixed(1)}년차 · ${i.cause}</dd>`:''}
      <dt>체중</dt><dd>${sp.massKg.toFixed(1)} kg</dd>
      <dt>내건성</dt><dd>${sp.droughtTol.toFixed(2)}</dd>
      <dt>식이</dt><dd>${sp.diet.map(d=>W.species[d].name).join(' · ')}</dd>
      ${i.kills>=1?`<dt>사냥</dt><dd>${fmt(i.kills)}마리</dd>`:''}
      ${i.peakHerd>=1?`<dt>최대 무리</dt><dd>${fmt(i.peakHerd)}마리</dd>`:''}
      <dt>자손</dt><dd>${i.offspring}</dd>
    </dl>
    ${trackSvg}
    <div><div class="lab" style="margin-bottom:4px">생애 사건 ${i.ev.length}건</div>
      <div id="tl">${i.ev.slice().reverse().map(e=>
        `<div><time>${(e[0]/365).toFixed(1)}년</time><span class="pip ${e[1]}"></span>
         <span>${EV_LABEL[e[1]]||''} · ${e[2]}</span></div>`).join('')}</div></div>`;
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
  const K={fire:'화재',loss:'손실',gain:'회복',act:'개입'};
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
function frame(){
  if(playing){acc+=speed;let n=0;while(acc>=1&&n<40){stepDay(W);acc--;n++;} if(acc>2)acc=0;}
  const st=readout();
  if($('mapCard').dataset.open==='true') paintMap();
  if(frameN%12===0){ drawPop(); drawSpecChart(); drawBars(); drawTiles(st); drawSpec(); drawInd(); drawLife(); }
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
const regen=()=>newWorld((Math.random()*1e9)|0,$('selTier').value,$('selClimate').value);
$('btnReset').onclick=regen; $('selTier').onchange=regen; $('selClimate').onchange=regen;
$('specFilter').onclick=e=>{const b=e.target.closest('[data-st]');if(!b)return;specTier=b.dataset.st;
  $('specFilter').querySelectorAll('button').forEach(o=>o.setAttribute('aria-pressed',o===b));drawSpec();};
$('tSpec').tHead.addEventListener('click',e=>{const th=e.target.closest('[data-k]');if(!th)return;
  const k=th.dataset.k; specSort=specSort.k===k?{k,dir:-specSort.dir}:{k,dir:-1}; drawSpec();});
$('indFilter').onclick=e=>{const b=e.target.closest('[data-live]');if(!b)return;indLive=b.dataset.live;
  $('indFilter').querySelectorAll('button').forEach(o=>o.setAttribute('aria-pressed',o===b));drawInd();};
$('indSearch').oninput=e=>{indQuery=e.target.value.trim();drawInd();};
$('tInd').tBodies[0].addEventListener('click',e=>{const tr=e.target.closest('[data-uid]');if(!tr)return;
  selUid=+tr.dataset.uid; drawInd(); drawLife();});
$('tInd').tHead.addEventListener('click',e=>{const th=e.target.closest('[data-k]');if(!th)return;
  const k=th.dataset.k; indSort=indSort.k===k?{k,dir:-indSort.dir}:{k,dir:-1}; drawInd();});
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
    status:s.status, extinctYear:s.extinctYear }));
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
cv.addEventListener('mousedown',ev=>{drag={x:ev.clientX,y:ev.clientY,vx,vy};cv.style.cursor='grabbing';});
addEventListener('mouseup',()=>{if(drag){drag=null;cv.style.cursor='';}});
cv.addEventListener('wheel',ev=>{ev.preventDefault();
  const [cx,cy]=cellAt(ev); setZoom(zoom*(ev.deltaY<0?1.25:0.8),cx,cy);},{passive:false});
cv.addEventListener('dblclick',()=>{zoom=1;vx=vy=0;zoomMeta();});
cv.addEventListener('mousemove',ev=>{
  const g=W.g;
  if(drag){ const r=cv.getBoundingClientRect(), v=visCells();
    vx=drag.vx-(ev.clientX-drag.x)/r.width*v; vy=drag.vy-(ev.clientY-drag.y)/r.height*v;
    clampView(); return; }
  const [fx,fy]=cellAt(ev), x=Math.floor(fx), y=Math.floor(fy);
  if(!g.inside(x,y))return;
  const i=g.idx(x,y);
  if(!W.land[i]){ $('vCursor').textContent='해상'; return; }
  /* 이 셀에 무엇이 있는지 등급별로 실제 값을 보여 준다 — 점의 기준을 눈으로 확인하는 자리 */
  let t2=0; for(const id of W.byTier.T2){ const o=W.t2Idx.get(id); if(o!==undefined) t2+=W.t2d[o*W.g.N+i]; }
  let hn=0,hc=0; for(const h of W.herds) if(W.g.idx(h.x|0,h.y|0)===i){hc++;hn+=h.n;}
  const pc=W.p4.filter(p=>W.g.idx(p.x|0,p.y|0)===i).length+W.p5.filter(p=>W.g.idx(p.x|0,p.y|0)===i).length;
  $('vCursor').textContent=`${W.elev[i]|0}m · 초본 ${W.grass[i].toFixed(1)}t · 수분 ${W.soil[i].toFixed(0)}mm`
     +(W.water[i]===2?' · 항구수원':W.water[i]===1?' · 계절수원':'')
     +` │ T2 ${fmt(t2)}마리 · 무리 ${hc}(${fmt(hn)}마리) · 육식 ${pc}`;});
cv.addEventListener('mouseleave',()=>{$('vCursor').textContent='셀 위로 이동';drag=null;});
$('zoomSeg').onclick=e=>{const b=e.target.closest('[data-z]');if(!b)return;
  if(b.dataset.z==='in') setZoom(zoom*1.6);
  else if(b.dataset.z==='out') setZoom(zoom/1.6);
  else {zoom=1;vx=vy=0;zoomMeta();}};
addEventListener('resize',fitMap);
newWorld(20260812,'XL','SAVANNA');
frame();
}
