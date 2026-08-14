/* 섬 생태 시뮬레이터 — 저수준 유틸 (난수 · 노이즈 · 격자)
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다. */

export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const mulberry32=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
export function makeNoise(rand){
  const P=256,g=new Float32Array(P*P);
  for(let i=0;i<P*P;i++)g[i]=rand();
  const at=(a,b)=>g[(b&(P-1))*P+(a&(P-1))];
  return(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
    const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    return(at(xi,yi)*(1-u)+at(xi+1,yi)*u)*(1-v)+(at(xi,yi+1)*(1-u)+at(xi+1,yi+1)*u)*v;};
}
export const fbm=(n,x,y,o)=>{let s=0,a=.5,f=1,t=0;for(let i=0;i<o;i++){s+=a*n(x*f,y*f);t+=a;a*=.5;f*=2}return s/t};
export function makeGrid(W,H){
  const N=W*H;
  return { W,H,N, idx:(x,y)=>y*W+x, xOf:i=>i%W, yOf:i=>(i/W)|0,
    inside:(x,y)=>x>=0&&y>=0&&x<W&&y<H,
    bestDir(x,y,score){
      let bu=-Infinity,bdx=0,bdy=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const u=score(ny*W+nx);
        if(u>bu){bu=u;bdx=dx;bdy=dy;}
      }
      return [bdx,bdy];
    } };
}
/* 순위-풍부도 : 기하급수. 소수가 우점하고 다수가 희소한 실제 군집 형태 */
export function rankShares(n,ratio){
  const s=[]; let tot=0;
  for(let i=0;i<n;i++){ const v=Math.pow(ratio,i); s.push(v); tot+=v; }
  return s.map(v=>v/tot);
}
