const L=require('/home/claude/loop/layout.js'); const {GEO,ROUTE,yBasis,hoseRuns,minBendRadius,pathLen}=L; const g=GEO;
const OD={pump:0.75,main:0.75,return:0.75,motor:0.4375,inv:0.5625};
const obs=[]; const cyl=(c,axis,r,h)=>obs.push({t:'c',c,axis,r,h}); const box=(c,h)=>obs.push({t:'b',c,h}); const cap=(a,b,r)=>obs.push({t:'s',a,b,r});
cyl(g.motor.c,0,116,48); cyl([g.motor.c[0]+50,g.motor.c[1],g.motor.c[2]],0,60,12);
box(g.inv.c,[212,108,40]);
cyl([g.pump.c[0],g.pump.c[1]+5,g.pump.c[2]],1,48,72);
cyl([g.pot.c[0],g.pot.base+40,g.pot.c[2]],1,36,130);
box(g.rad.c,[g.rad.W/2+2,g.rad.H/2+2,g.rad.D/2+2]);
box([g.rad.c[0],g.rad.c[1],g.fan.c[2]+8],[135,75,50]);
cyl(g.catchCan.c,1,46,95);
for(const [a,b] of g.frameTubes) cap(a,b,12.7);
function depth(p,o){
  if(o.t==='b'){ let m=-1e9; for(let i=0;i<3;i++) m=Math.max(m,Math.abs(p[i]-o.c[i])-o.h[i]); return -m; }
  if(o.t==='c'){ const ax=o.axis; let rr=0; for(let i=0;i<3;i++) if(i!==ax) rr+=(p[i]-o.c[i])**2; rr=Math.sqrt(rr); return Math.min(o.r-rr, o.h-Math.abs(p[ax]-o.c[ax])); }
  const ab=[o.b[0]-o.a[0],o.b[1]-o.a[1],o.b[2]-o.a[2]], ap=[p[0]-o.a[0],p[1]-o.a[1],p[2]-o.a[2]]; const t=Math.max(0,Math.min(1,(ab[0]*ap[0]+ab[1]*ap[1]+ab[2]*ap[2])/(ab[0]**2+ab[1]**2+ab[2]**2)));
  return o.r-Math.hypot(ap[0]-ab[0]*t,ap[1]-ab[1]*t,ap[2]-ab[2]*t);
}
const NV={h2:2,h3m:2,h4m:2,h3i:1,h4i:2,h5:0,h6:3};
function apply(R){ Object.assign(ROUTE,R); g.pump.yaw=R.pumpYaw; g.pot.yaw=R.potYaw||0; g.ySplit=yBasis(R.ySplit); g.yMerge=yBasis(R.yMerge); }
function evalR(R, report){
  apply(R); const runs=hoseRuns(R); let cost=0; const ys=[g.ySplit.c,g.yMerge.c]; const placed=[];
  for(const y of ys){ for(const o of obs){ const d=depth(y,o)+26; if(d>0) cost+=300*d*d; } }
  if(Math.hypot(ys[0][0]-ys[1][0],ys[0][1]-ys[1][1],ys[0][2]-ys[1][2])<70) cost+=1e5;
  const info=[];
  for(const r of runs){
    const ro=(OD[r.line]+0.25)*25.4/2, p=r.path, Lp=r.L; let pen=0,s=0,maxd=0;
    for(let i=0;i<p.length;i++){ if(i>0) s+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1],p[i][2]-p[i-1][2]);
      { const lim=p[i][2]<-790?300:232; if(Math.abs(p[i][0])>lim) pen+=(Math.abs(p[i][0])-lim)**2; } if(p[i][1]<25) pen+=(25-p[i][1])**2; if(p[i][2]>-14) pen+=4*(p[i][2]+14)**2; if(p[i][1]>660) pen+=(p[i][1]-660)**2;
      if(s<24||s>Lp-24) continue;
      for(const o of obs){ const d=depth(p[i],o)+ro+3; if(d>0){pen+=d*d; maxd=Math.max(maxd,d-3);} }
      for(const y of ys){ const dd=Math.hypot(p[i][0]-y[0],p[i][1]-y[1],p[i][2]-y[2]); if(dd<ro+28) {pen+=(ro+28-dd)**2;} }
      for(const q of placed) for(let j=0;j<q.p.length;j+=2){ const dd=Math.hypot(p[i][0]-q.p[j][0],p[i][1]-q.p[j][1],p[i][2]-q.p[j][2]); const lim=ro+q.ro+3; if(dd<lim) {pen+=(lim-dd)**2; maxd=Math.max(maxd,lim-dd);} } }
    placed.push({p,ro});
    const rT=(OD[r.line]+0.25)*25.4*2.5, mr=p.length>8?minBendRadius(p):1e9;
    cost+=Lp+30*pen+(+process.env.BW||150)*Math.max(0,rT-mr)**1.5;
    if(report) info.push(`${r.id} L ${Lp.toFixed(0)} minR ${mr>1e8?'straight':mr.toFixed(0)} (≥${rT.toFixed(0)}) clash ${maxd.toFixed(1)}`);
  }
  if(report) console.error(info.join('\n'));
  return cost;
}
let seed=41; const rnd=()=>((seed=seed*16807%2147483647)/2147483647-0.5)*2;
const clone=(o)=>JSON.parse(JSON.stringify(o));
const P0=L.ports();
let best=clone(ROUTE); best.vias={}; const START=process.argv[3]?JSON.parse(require('fs').readFileSync(process.argv[3],'utf8')):null;
// initial vias: points along straight line between leads
const pairs={h2:['pumpOut','ySplitIn'],h3m:['ySplitM','motorIn'],h4m:['motorOut','yMergeM'],h3i:['ySplitI','invIn'],h4i:['invOut','yMergeI'],h5:['yMergeOut','radIn'],h6:['radOut','potIn']};
function initVias(R){ apply(R); const P=L.ports(); R.vias={}; for(const id in pairs){ const [a,b]=pairs[id]; const v=[]; const A=P[a].map((x,i)=>x+P._dir[a][i]*60), B=P[b].map((x,i)=>x+P._dir[b][i]*60); for(let k=1;k<=NV[id];k++){ const t=k/(NV[id]+1); v.push(A.map((x,i)=>x+(B[i]-x)*t)); } R.vias[id]={v,la:45,lb:45}; } }
initVias(best);
if(START){ best=Object.assign(clone(ROUTE),START); }
let bc=evalR(best);
const N=+process.argv[2]||30000;
for(let it=0;it<N;it++){
  const sc= START ? (it<N*0.5?12:4) : (it<N*0.4?40: it<N*0.75?15:5); const c=clone(best);
  const which=Math.floor(Math.random()*4);
  if(which===0){ if(!process.env.FIXYAW){ c.pumpYaw+=rnd()*sc*0.01; c.potYaw=(c.potYaw||0)+rnd()*sc*0.01; } }
  else if(which===1){ const Y=Math.random()<0.5?c.ySplit:c.yMerge; Y.c=Y.c.map(x=>x+rnd()*sc*0.6); Y.a=Y.a.map(x=>x+rnd()*sc*0.01); Y.r+=rnd()*sc*0.01; }
  else { const ids=Object.keys(c.vias); const id=ids[Math.floor(Math.random()*ids.length)]; const v=c.vias[id]; v.v=v.v.map(p=>p.map(x=>x+rnd()*sc)); v.la=Math.max(25,Math.min(110,v.la+rnd()*sc*0.3)); v.lb=Math.max(25,Math.min(110,v.lb+rnd()*sc*0.3)); }
  const cc=evalR(c); if(cc<bc){bc=cc;best=c;}
}
evalR(best,true); console.error('cost',bc.toFixed(0));
const rd=(x)=>Math.round(x*1e6)/1e6;
const out={potYaw:rd(best.potYaw||0),pumpYaw:rd(best.pumpYaw),ySplit:{c:best.ySplit.c.map(rd),a:best.ySplit.a.map(rd),r:rd(best.ySplit.r)},yMerge:{c:best.yMerge.c.map(rd),a:best.yMerge.a.map(rd),r:rd(best.yMerge.r)},vias:{}};
for(const id in best.vias) out.vias[id]={v:best.vias[id].v.map(p=>p.map(rd)),la:rd(best.vias[id].la),lb:rd(best.vias[id].lb)};
console.log(JSON.stringify(out));
