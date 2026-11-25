// Cooling-loop 3D renderer: parametric parts built from GEO (layout.js), PBR shading with shadow map,
// clear hoses with temperature-coloured coolant, flow ribbons at solved velocities, explode, cutaway, picking.
function inv4(m) {
  const o = new Float32Array(16), [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return o; det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}
function lathe(profile, seg = 48, a0 = 0, a1 = Math.PI * 2) {
  const g = new GB(), n = profile.length;
  const nr = profile.map((p, i) => { const a = profile[Math.max(0, i - 1)], b = profile[Math.min(n - 1, i + 1)]; const dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1; return [dy / l, -dr / l]; });
  let len = 0;
  for (let i = 0; i < n; i++) {
    if (i) len += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]);
    for (let j = 0; j <= seg; j++) { const a = a0 + (a1 - a0) * j / seg, c = Math.cos(a), s = Math.sin(a); g.v([profile[i][0] * c, profile[i][1], profile[i][0] * s], [nr[i][0] * c, nr[i][1], nr[i][0] * s], [len, j / seg]); }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j; g.q(a, a + seg + 1, a + seg + 2, a + 1); }
  return g.done();
}
function barbProfile(L, ro, ri, ridges = 3) { // along +y from 0 to L
  const p = [[ri, 0], [ro * 1.08, 0], [ro * 1.08, 4]];
  const z0 = L * 0.42, step = (L - z0) / ridges;
  p.push([ro, 4], [ro, z0]);
  for (let k = 0; k < ridges; k++) { const y = z0 + k * step; p.push([ro, y], [ro * 1.13, y + step * 0.65], [ro * 0.94, y + step * 0.7]); }
  p.push([ro * 0.9, L], [ri, L], [ri, 0]);
  return p;
}
const xf = (m, f) => rotXYZ(m, f);
const toX = (v) => [v[1], -v[0], v[2]];   // y-axis -> +x
const toNX = (v) => [-v[1], v[0], v[2]];
const toZ = (v) => [v[0], -v[2], v[1]];   // y-axis -> +z
const toNY = (v) => [v[0], -v[1], -v[2]];
const toNZ = (v) => [v[0], v[2], -v[1]];   // y-axis -> -z
function along(m, dir) { // orient a +y mesh along unit dir
  const d = nrm(dir); const up = [0, 1, 0];
  let ax = cross(up, d); const s = Math.hypot(...ax), c = up[0] * d[0] + up[1] * d[1] + up[2] * d[2];
  if (s < 1e-6) return c > 0 ? m : xf(m, toNY);
  ax = ax.map((v) => v / s); const a = Math.atan2(s, c), ca = Math.cos(a), sa = Math.sin(a);
  const R = (v) => { const k = ax, dt = k[0] * v[0] + k[1] * v[1] + k[2] * v[2], cr = cross(k, v); return [v[0] * ca + cr[0] * sa + k[0] * dt * (1 - ca), v[1] * ca + cr[1] * sa + k[1] * dt * (1 - ca), v[2] * ca + cr[2] * sa + k[2] * dt * (1 - ca)]; };
  return xf(m, R);
}
function shroudLoft(w, h, R, z0, z1, n = 14, seg = 96) {
  const g = new GB();
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = t * t * (3 - 2 * t), z = z0 + (z1 - z0) * t;
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const k = Math.min(Math.abs(c) > 1e-6 ? (w / 2) / Math.abs(c) : 1e9, Math.abs(sn) > 1e-6 ? (h / 2) / Math.abs(sn) : 1e9);
      const x = c * (k + (R - k) * s), y = sn * (k + (R - k) * s);
      g.v([x, y, z], [c, sn, 0], [z, j / seg]);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j; g.q(a, a + seg + 1, a + seg + 2, a + 1); }
  const m = g.done();
  // normals from geometry
  const N = new Float32Array(m.P.length);
  for (let t = 0; t < m.I.length; t += 3) { const [a, b, c] = [m.I[t] * 3, m.I[t + 1] * 3, m.I[t + 2] * 3]; const e1 = [m.P[b] - m.P[a], m.P[b + 1] - m.P[a + 1], m.P[b + 2] - m.P[a + 2]], e2 = [m.P[c] - m.P[a], m.P[c + 1] - m.P[a + 1], m.P[c + 2] - m.P[a + 2]]; const nn = cross(e1, e2); for (const v of [a, b, c]) { N[v] += nn[0]; N[v + 1] += nn[1]; N[v + 2] += nn[2]; } }
  for (let i = 0; i < N.length; i += 3) { const q = nrm([N[i], N[i + 1], N[i + 2]]); N[i] = q[0]; N[i + 1] = q[1]; N[i + 2] = q[2]; }
  m.N = N; return m;
}
const merge = (...parts) => { const g = new GB(); for (const [m, o] of parts) g.add(m, o || [0, 0, 0]); return g.done(); };
const ringMesh = (c, R, rt, plane) => sweep(arcPts(c, R, 0, Math.PI * 2, plane, 48), rt, 10, true);

const LRAMP = `
vec3 ramp(float t){ t=clamp(t,0.,1.);
 vec3 c0=vec3(.11,.23,.62),c1=vec3(.16,.58,.86),c2=vec3(.55,.88,.82),c3=vec3(.98,.88,.45),c4=vec3(.96,.55,.2),c5=vec3(.86,.13,.2);
 float s=t*5.; if(s<1.)return mix(c0,c1,s); if(s<2.)return mix(c1,c2,s-1.); if(s<3.)return mix(c2,c3,s-2.); if(s<4.)return mix(c3,c4,s-3.); return mix(c4,c5,s-4.);}
vec3 lin(vec3 c){ return pow(c,vec3(2.2)); }`;
const LVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec2 aUV; layout(location=3) in vec3 iOff; layout(location=4) in vec4 iA;
uniform mat4 uVP; uniform mat4 uModel; out vec3 vW; out vec3 vN; out vec2 vUV; out vec4 vA; out vec3 vL;
void main(){ vec4 w=uModel*vec4(aPos+iOff,1.); vN=mat3(uModel)*aNrm; vW=w.xyz; vUV=aUV; vA=iA; vL=aPos; gl_Position=uVP*w; }`;
const LFS_DEPTH = `#version 300 es
precision mediump float; out vec4 o; void main(){ o=vec4(1.); }`;
const LFS_PICK = `#version 300 es
precision mediump float; uniform vec3 uPickC; uniform float uCutZ; uniform int uCutOn; in vec3 vW; out vec4 o; void main(){ if(uCutOn==1&&vW.z>uCutZ) discard; o=vec4(uPickC,1.); }`;
const LFS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW; in vec3 vN; in vec2 vUV; in vec4 vA; in vec3 vL; out vec4 o;
uniform vec3 uCam; uniform int uKind; uniform float uThermal; uniform float uTlo; uniform float uThi; uniform float uTa; uniform float uTb; uniform float uLen;
uniform float uRW; uniform float uRD; uniform float uLp; uniform float uTheta; uniform vec3 uRC;
uniform int uCutOn; uniform float uCutZ; uniform float uAlpha; uniform int uSel; uniform float uTime; uniform int uHDR; uniform int uUseAO; uniform vec2 uScreen; uniform float uFade;
uniform sampler2DShadow uShadow; uniform mat4 uLightVP; uniform vec3 uLdir; uniform sampler2D uTemp; uniform vec2 uTempSize; uniform sampler2D uAO;
${LRAMP}
const float PI=3.14159265;
vec3 env(vec3 d){
 float y=d.y; vec3 c=mix(vec3(.018,.021,.027),vec3(.06,.07,.085),smoothstep(-.1,.7,y));
 c+=vec3(2.6,2.55,2.45)*smoothstep(.80,.93,y);
 c+=vec3(2.8,2.5,2.1)*smoothstep(.93,.99,dot(d,normalize(vec3(.75,.35,.55))));
 c+=vec3(1.1,1.4,2.0)*smoothstep(.90,.985,dot(d,normalize(vec3(-.8,.25,-.55))));
 c+=vec3(.6,.62,.66)*smoothstep(.94,.995,dot(d,normalize(vec3(-.6,.15,.8))));
 c+=vec3(.9,.9,.95)*smoothstep(.985,.999,dot(d,normalize(vec3(.1,.2,1.))));
 c+=vec3(.12,.14,.17)*exp(-abs(y)*10.);
 if(y<0.) c=mix(c,vec3(.012,.014,.017),smoothstep(0.,-.12,y));
 return c; }
vec3 envR(vec3 d,float r){ vec3 a=mix(vec3(.03,.035,.042),vec3(.5,.52,.55),clamp(d.y*.6+.25,0.,1.)); return mix(env(d),a,clamp(r*r*1.8,0.,1.)); }
float D_GGX(float nh,float a){ float a2=a*a; float d=nh*nh*(a2-1.)+1.; return a2/(PI*d*d); }
float G_S(float nv,float nl,float r){ float k=(r+1.)*(r+1.)/8.; return nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k); }
vec3 bump(vec3 n,float h,float s){ vec3 dx=dFdx(vW),dy=dFdy(vW); float hx=dFdx(h),hy=dFdy(h); vec3 r1=cross(dy,n),r2=cross(n,dx); float det=dot(dx,r1); if(abs(det)<1e-9) return n; vec3 g=sign(det)*(hx*r1+hy*r2); return normalize(abs(det)*n-g*s); }
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float shadowAt(vec3 w,vec3 n){
 vec4 l=uLightVP*vec4(w+n*1.2,1.); vec3 p=l.xyz/l.w*.5+.5; if(p.x<0.||p.x>1.||p.y<0.||p.y>1.) return 1.;
 float s=0.; vec2 t=vec2(1./2048.);
 for(int i=-2;i<=2;i++) for(int j=-2;j<=2;j++) s+=texture(uShadow,vec3(p.xy+vec2(i,j)*t*1.1,p.z-.0012));
 return s/25.; }
vec3 light(vec3 base,float metal,float rough,vec3 n,vec3 v,float sh,float ao){
 vec3 F0=mix(vec3(.04),base,metal); vec3 dif=base*(1.-metal); float nv=max(dot(n,v),1e-3); vec3 col=vec3(0.);
 vec3 Ls[3]; vec3 Cs[3]; Ls[0]=uLdir; Cs[0]=vec3(3.3,3.05,2.8)*sh; Ls[1]=normalize(vec3(-.7,.3,-.5)); Cs[1]=vec3(.6,.75,1.1)*1.2; Ls[2]=normalize(vec3(-.5,.4,.8)); Cs[2]=vec3(.4,.42,.45);
 for(int i=0;i<3;i++){ vec3 L=Ls[i]; float nl=max(dot(n,L),0.); if(nl<=0.) continue; vec3 h=normalize(L+v); float nh=max(dot(n,h),0.);
  float a=max(.03,rough*rough); vec3 F=F0+(1.-F0)*pow(1.-max(dot(h,v),0.),5.);
  col+=(dif*(1.-F)/PI+min(D_GGX(nh,a)*G_S(nv,nl,rough)/(4.*nv*nl+1e-3),6.)*F)*Cs[i]*nl*(i==0?1.:mix(.4,1.,ao)); }
 vec3 Fr=F0+(max(vec3(1.-rough),F0)-F0)*pow(1.-nv,5.);
 col+=(dif*mix(vec3(.05,.055,.065),vec3(.3,.32,.36),n.y*.5+.5)*.9+envR(reflect(-v,n),rough)*Fr)*ao;
 return col; }
float tnorm(float T){ return (T-uTlo)/max(.1,uThi-uTlo); }
vec3 outc(vec3 c){ if(uHDR==1) return c; c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14); return pow(clamp(c,0.,1.),vec3(1./2.2)); }
void main(){
 if(uCutOn==1&&vW.z>uCutZ) discard;
 vec3 n=normalize(vN); vec3 v=normalize(uCam-vW); if(dot(n,v)<0.) n=-n;
 float alpha=uAlpha; float sao=uUseAO==1?texture(uAO,gl_FragCoord.xy/uScreen).r:1.;
 if(uKind==3){ float r=length(vW.xz-vec2(40.,0.))/1700.; vec3 c=mix(vec3(.011,.013,.017),vec3(.0045,.0055,.0075),smoothstep(0.,.75,r));
  float sh=shadowAt(vW,vec3(0,1,0)); c*=(.3+.7*sh)*mix(1.,sao,.9);
  float sp=pow(max(0.,1.-r*1.6),3.)*.02; c+=sp*vec3(.8,.85,1.);
  c=mix(c,vec3(.0045,.0055,.0075),smoothstep(.35,.95,r)); o=vec4(outc(c),1.); return; }
 vec3 base=vec3(.8,.82,.84); float metal=1., rough=.32, ao=1.; vec3 emit=vec3(0.); float tn=-1.;
 if(uKind==0){ float s=vnoise(vW.xy*.05)*.6+vnoise(vW.zy*.05)*.4; n=bump(n,vnoise(vW.xz*vec2(.3,.3)+vW.y*.02)*.01,.2); base=vec3(.74,.76,.79)*(.96+.05*s); rough=.28+.08*s; }
 if(uKind==1||uKind==2){
  vec2 tc=vec2(((vW.x-uRC.x+uRW*.5)/uRW*(uTempSize.x-1.)+.5)/uTempSize.x,(vA.z+.5)/uTempSize.y); vec4 tt=texture(uTemp,tc);
  if(uKind==1){ tn=tt.b; base=vec3(.74,.76,.79); rough=.28; }
  else { float zf=clamp((uRD*.5-(vW.z-uRC.z))/uRD,0.,1.); float dm=zf*uRD; float u=vUV.x;
   float nL=floor((uRD-3.4*uLp)/uLp*.5); float e=uLp, b1=e+nL*uLp, t0=b1+1.4*uLp, b2=t0+nL*uLp; float sgn=0.; if(dm>e&&dm<b1) sgn=1.; else if(dm>t0&&dm<b2) sgn=-1.;
   float ph=dm/uLp; float detail=1.-smoothstep(.18,.45,fwidth(ph));
   if(u>=0.&&sgn!=0.&&u>.08&&u<.92){ float s=fract(ph); float edge=min(s,1.-s); float aw=fwidth(ph)*1.2+.005; float m=smoothstep(.05,.05+aw,edge);
    if(u>.12&&u<.88&&uThermal<.5) alpha=mix(1.,m,detail);
    n=normalize(mix(n,normalize(n+vec3(0.,0.,sin(radians(uTheta)*sgn)*sign(n.x+1e-4))*1.2),detail)); ao=mix(1.,.55+.45*smoothstep(0.,.18,edge),detail); }
   if(u<0.) ao=.8; float ed=min(zf,1.-zf); ao*=mix(1.,.38,smoothstep(.0,.16,ed));
   float mid=u<0.?0.:1.-abs(2.*u-1.); tn=mix(tt.r,mix(tt.g*.55,tt.g,zf),mid*.55);
   float var=hash(vec2(floor((vW.x+500.)/max(.3,uLp*1.2)),vA.z)); base=vec3(.86,.87,.89)*(.9+.14*var); rough=.34+.1*var; metal=.6; }
 }
 if(uKind==4){ base=vec3(.03,.031,.034); metal=0.; rough=.55; }
 if(uKind==5){ base=vec3(.72,.04,.06); metal=.85; rough=.26; n=bump(n,smoothstep(.3,.7,abs(fract(vUV.x*.9)-.5)*2.)*.25,.5); }
 if(uKind==6){ base=vec3(.04,.042,.046); metal=0.; rough=.42; n=bump(n,vnoise(vW.xy*1.5+vW.z)*.03,.4); }
 if(uKind==7){ float ph=fract(vUV.x/1.35); n=bump(n,pow(ph,1.6)*.6,.9); base=vec3(.84,.85,.87); rough=.16; vec3 tint=mix(vec3(1.),vec3(1.,.9,.75),.25); base*=tint; }
 if(uKind==8){ base=vec3(.66,.67,.69); rough=.2; n=bump(n,vnoise(vW.xy*vec2(.5,30.))*.04,.4); }
 if(uKind==9){ base=vec3(.07,.075,.08); metal=0.; rough=.75; }
 if(uKind==10){ float T=mix(uTa,uTb,clamp(vUV.x/max(1.,uLen),0.,1.)); vec3 c=lin(ramp(tnorm(T))); base=c*.8; metal=0.; rough=.25; emit=c*.32; }
 if(uKind==11){ base=vec3(.92,.96,1.); metal=0.; rough=.05; }
 if(uKind==12){ base=vec3(.022,.024,.027); metal=.35; rough=.48; if(uFade>0.) alpha*=smoothstep(0.,130.,vUV.x)*smoothstep(uLen,uLen-130.,vUV.x); }
 if(uKind==13){ base=vec3(.045,.05,.058); metal=.75; rough=.36; float g=abs(fract(vL.x/7.)-.5); float rib=step(.92,abs(vN.y))*smoothstep(.36,.46,g); n=bump(n,rib*.5,.5); base*=1.+.15*vnoise(vW.xz*.05); }
 if(uKind==14){ base=vec3(.58,.6,.63); metal=.95; rough=.22; float ang=atan(vL.y,vL.x); n=bump(n,(sin(vL.z*1.9)*.5+.5)*step(.5,1.-abs(vN.z))*.35,.6); }
 if(uKind==15){ base=vec3(.78,.22,.03); metal=0.; rough=.42; }
 if(uKind==16){ base=vec3(.045,.047,.052); metal=0.; rough=.6; n=bump(n,smoothstep(.2,.5,abs(fract(vW.y/.25)-.5))*.12,.6); }
 if(uKind==17){ base=vec3(1.,.15,.2); metal=0.; rough=.4; emit=vec3(.9,.06,.1)*(.5+.4*sin(uTime*4.)); }
 if(uKind==18){ // EMRAX face: 10 triangular windows between spokes, copper coils visible behind
  float r=length(vL.xy), a=atan(vL.y,vL.x); float s=fract(a/(6.2831853)*10.); float r0=44., r1=98.;
  float w=mix(.05,.40,clamp((r-r0)/(r1-r0),0.,1.));
  if(r>r0&&r<r1&&abs(s-.5)<w) discard;
  base=vec3(.6,.62,.65); metal=.95; rough=.24; float ring=step(r1,r)*step(r,r1+4.)+step(r0-4.,r)*step(r,r0);
  n=bump(n,sin(r*1.1)*.05*step(r1+4.,r),.4); base*=1.-.25*ring; }
 if(uKind==19){ float a=atan(vL.y,vL.x); base=vec3(.78,.42,.22); metal=1.; rough=.3; n=bump(n,smoothstep(.2,.8,abs(fract(a*48./6.2831853)-.5)*2.)*.6,.8); ao*=.75; }
 if(uKind==21){ base=vec3(.75,.77,.8); metal=.2; rough=.4; float l=step(.55,fract(vL.x/4.))*step(abs(vL.y-vL.y),1.); base*=.9+.1*l; }
 if(uKind==22){ base=vec3(.92,.93,.95); metal=1.; rough=.07; }
 if(uKind==23){ base=vec3(.95,.78,.08); metal=0.; rough=.45; }
 if(uKind==24){ base=vec3(.12,.32,.85); metal=.85; rough=.28; }
 if(uKind==25){ base=vec3(.6,.05,.05); metal=0.; rough=.45; }
 if(uKind==26){ base=vec3(.35,.62,.95); metal=0.; rough=.1; emit=vec3(.05,.12,.25); }
 if(uKind==27){ base=vec3(.30,.31,.33); metal=0.; rough=.5; }
 if(uThermal>.5&&tn>=0.){ vec3 tcol=lin(ramp(tn)); base=tcol; metal=.25; rough=.4; emit=tcol*.22; }
 if(alpha>.99&&uKind!=11&&uKind!=10&&uKind!=26) ao*=mix(1.,sao,.92);
 float sh=shadowAt(vW,n);
 vec3 col=light(base,metal,rough,n,v,sh,ao)+emit;
 if(uKind==11){ float f=pow(1.-max(dot(n,v),0.),4.); alpha=uAlpha*(.05+.5*f); }
 if(uSel==1){ col+=vec3(.35,.16,.05)*(.6+.4*sin(uTime*5.)); }
 if(any(isnan(col))||any(isinf(col))) col=vec3(0.); col=min(col,vec3(40.));
 o=vec4(outc(col),alpha);
}`;
const LVS_RIB = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aQ; layout(location=2) in vec3 aS;
uniform mat4 uVP; uniform vec2 uRes; uniform float uWid; uniform float uTlo; uniform float uThi; out vec4 vC; out float vE;
${LRAMP}
void main(){ vec4 p=uVP*vec4(aP,1.), q=uVP*vec4(aQ,1.); vec2 a=p.xy/p.w*uRes, b=q.xy/q.w*uRes; vec2 d=b-a; float l=length(d); d=l>1e-4?d/l:vec2(1.,0.);
 p.xy+=vec2(-d.y,d.x)*aS.x*uWid*(.4+.6*aS.z)/uRes*p.w; gl_Position=p; vE=aS.x; vC=vec4(ramp((aS.y-uTlo)/max(.1,uThi-uTlo)),aS.z); }`;
const LFS_RIB = `#version 300 es
precision mediump float; in vec4 vC; in float vE; out vec4 o; uniform int uHDR;
void main(){ float e=1.-abs(vE); float a=vC.a*smoothstep(0.,.7,e); vec3 c=mix(vC.rgb,vec3(1.),.25*e)*(1.+.5*e); if(uHDR==1) c=pow(c,vec3(2.2))*2.2; o=vec4(c*a,a); }`;
// ---- post-processing ----
const PVS = `#version 300 es
out vec2 vUV; void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); vUV=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
const PFS_G = `#version 300 es
precision highp float; in vec3 vW; in vec3 vN; uniform mat4 uV; uniform int uCutOn; uniform float uCutZ; out vec4 o;
void main(){ if(uCutOn==1&&vW.z>uCutZ) discard; vec3 n=normalize(mat3(uV)*normalize(vN)); if(n.z<0.) n=-n; o=vec4(n*.5+.5,1.); }`;
const PFS_SSAO = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uD; uniform sampler2D uN; uniform mat4 uP; uniform mat4 uIP; uniform vec3 uK[16]; uniform float uRad;
vec3 vpos(vec2 uv){ float d=texture(uD,uv).r; vec4 p=uIP*vec4(uv*2.-1.,d*2.-1.,1.); return p.xyz/p.w; }
float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){ float d=texture(uD,vUV).r; if(d>=.99999){ o=vec4(1.); return; }
 vec3 P=vpos(vUV); vec3 N=normalize(texture(uN,vUV).xyz*2.-1.);
 float ang=h(gl_FragCoord.xy)*6.2831853; vec3 r=vec3(cos(ang),sin(ang),0.);
 vec3 T=normalize(r-N*dot(r,N)); vec3 B=cross(N,T); mat3 TBN=mat3(T,B,N);
 float rad=uRad*clamp(-P.z/1800.,.35,2.5); float occ=0.;
 for(int i=0;i<16;i++){ vec3 S=P+TBN*uK[i]*rad; vec4 q=uP*vec4(S,1.); vec2 su=q.xy/q.w*.5+.5; if(su.x<0.||su.x>1.||su.y<0.||su.y>1.) continue;
  float sz=vpos(su).z; float rc=smoothstep(0.,1.,rad/max(1e-3,abs(P.z-sz))); occ+=(sz>=S.z+rad*.04?1.:0.)*rc; }
 o=vec4(vec3(pow(1.-occ/16.,1.6)),1.); }`;
const PFS_BLUR_AO = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uA; uniform sampler2D uD; uniform vec2 uTx;
void main(){ float d0=texture(uD,vUV).r; float s=0.,w=0.; for(int i=-2;i<=2;i++) for(int j=-2;j<=2;j++){ vec2 uv=vUV+vec2(i,j)*uTx; float d=texture(uD,uv).r; float wt=exp(-abs(d-d0)*4000.); s+=texture(uA,uv).r*wt; w+=wt; } o=vec4(vec3(s/max(w,1e-4)),1.); }`;
const PFS_BRIGHT = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uC; uniform vec2 uTx;
void main(){ vec3 c=vec3(0.); for(int i=0;i<2;i++) for(int j=0;j<2;j++) c+=texture(uC,vUV+(vec2(i,j)-.5)*uTx).rgb; c*=.25; if(any(isnan(c))) c=vec3(0.); float l=dot(c,vec3(.3,.59,.11)); o=vec4(min(c*smoothstep(1.4,4.,l),vec3(8.)),1.); }`;
const PFS_BLUR = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uC; uniform vec2 uDir;
void main(){ float w[5]=float[](.227,.1945,.1216,.054,.0162); vec3 c=texture(uC,vUV).rgb*w[0]; for(int i=1;i<5;i++){ c+=texture(uC,vUV+uDir*float(i)).rgb*w[i]; c+=texture(uC,vUV-uDir*float(i)).rgb*w[i]; } o=vec4(c,1.); }`;
const PFS_COMP = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uC; uniform sampler2D uB; uniform float uExp; uniform vec2 uRes;
vec3 aces(vec3 c){ return clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.); }
void main(){ vec3 c=texture(uC,vUV).rgb; if(any(isnan(c))) c=vec3(0.); vec3 bl=texture(uB,vUV).rgb; if(any(isnan(bl))) bl=vec3(0.); c+=bl*.4; c=aces(c*uExp);
 vec2 q=vUV-.5; float vig=1.-dot(q,q)*.55; c*=vig; c=pow(c,vec3(1./2.2));
 c+= (fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
 o=vec4(c,1.); }`;
const PFS_BACK = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform int uHDR;
void main(){ vec2 q=vUV-vec2(.5,.62); float r=length(q*vec2(1.,1.25)); vec3 c=mix(vec3(.016,.02,.027),vec3(.0045,.0055,.0075),smoothstep(0.,.75,r)); if(uHDR==0) c=pow(c,vec3(1./2.2)); o=vec4(c,1.); }`;

class LoopRenderer {
  constructor(canvas, labelsEl) {
    this.cv = canvas; this.labelsEl = labelsEl;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) { this.ok = false; return; }
    this.ok = true; this.gl = gl;
    this.prog = this.mk(LVS, LFS); this.dprog = this.mk(LVS, LFS_DEPTH); this.pprog = this.mk(LVS, LFS_PICK); this.rprog = this.mk(LVS_RIB, LFS_RIB);
    this.SM = 2048;
    this.shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.SM, this.SM);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE], [gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.shFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shTex, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.tTex = gl.createTexture(); this.instBuf = gl.createBuffer(); this.ribBuf = gl.createBuffer();
    this.hdr = !!gl.getExtension('EXT_color_buffer_float'); gl.getExtension('OES_texture_float_linear');
    this.gprog = this.mk(LVS, PFS_G); this.backProg = this.mk(PVS, PFS_BACK);
    if (this.hdr) { this.ssaoProg = this.mk(PVS, PFS_SSAO); this.aoBlurProg = this.mk(PVS, PFS_BLUR_AO); this.brightProg = this.mk(PVS, PFS_BRIGHT); this.blurProg = this.mk(PVS, PFS_BLUR); this.compProg = this.mk(PVS, PFS_COMP); }
    this.fsVAO = gl.createVertexArray();
    this.kernel = new Float32Array(48); for (let i = 0; i < 16; i++) { const a = i * 2.399963, z = 0.15 + 0.85 * ((i + 0.5) / 16), r = Math.sqrt(1 - z * z), sc = 0.2 + 0.8 * ((i + 1) / 16) ** 2; this.kernel.set([Math.cos(a) * r * sc, Math.sin(a) * r * sc, z * sc], i * 3); }
    this.samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    this.tg = null;
    this.yaw = -0.6; this.pitch = 0.22; this.zoom = 1; this.autoSpin = true; this.pan = [0, 0];
    this.thermal = 1; this.cut = false; this.flow = true; this.explode = 0; this.sel = null; this.t = 0; this.fanAng = 0;
    this.Ldir = nrm([0.42, 0.88, 0.5]);
    this.bindInput();
  }
  mk(vs, fs) {
    const gl = this.gl, sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    p.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); p.u[a.name] = gl.getUniformLocation(p, a.name); }
    return p;
  }
  up(m) { const gl = this.gl, mk = (d, t = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(t, b); gl.bufferData(t, d, gl.STATIC_DRAW); return b; }; return { p: mk(m.P), n: mk(m.N), u: mk(m.U), i: mk(m.I, gl.ELEMENT_ARRAY_BUFFER), count: m.I.length }; }
  free(o) { if (!o) return; for (const k of ['p', 'n', 'u', 'i']) this.gl.deleteBuffer(o[k]); }
  bindInput() {
    const cv = this.cv, ptrs = new Map(); let pinch = 0, moved = 0, down = null;
    cv.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); cv.setPointerCapture(e.pointerId); moved = 0; down = [e.clientX, e.clientY]; });
    cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4 && this.autoSpin) { this.autoSpin = false; this.onSpin && this.onSpin(false); }
      if (ptrs.size === 1) { if (e.shiftKey || e.buttons === 4) { this.pan[0] -= dx * this.zoom * 1.2; this.pan[1] += dy * this.zoom * 1.2; } else { this.yaw -= dx * 0.007; if (e.pointerType !== 'touch') this.pitch = Math.max(-0.1, Math.min(1.35, this.pitch + dy * 0.005)); } }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) this.zoom = Math.max(0.25, Math.min(2, this.zoom * pinch / d)); pinch = d; }
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; if (moved < 6 && down && e.type === 'pointerup') this.pickAt(e.clientX, e.clientY); down = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(0.25, Math.min(2, this.zoom * Math.exp(e.deltaY * 0.001))); }, { passive: false });
    cv.addEventListener('dblclick', () => { this.yaw = -0.6; this.pitch = 0.22; this.zoom = 1; this.pan = [0, 0]; this.focus('loop'); this.onFocus && this.onFocus('loop'); });
  }
  // ---------- build the assembly ----------
  build(runs, hoseDims, radR) {
    const g = GEO; this.runs = runs;
    if (this.items) for (const it of this.items) if (it.own) this.free(it.mesh);
    const items = this.items = []; let pid = 0; this.parts = {};
    const add = (part, mesh, kind, o = {}) => {
      if (!this.parts[part]) this.parts[part] = { pid: ++pid, ex: o.ex || [0, 0, 0] };
      const it = { part, mesh: this.up(mesh), own: true, kind, ex: this.parts[part].ex, cut: !!o.cut, glass: !!o.glass || !!o.fade, alpha: o.alpha ?? 1, len: o.len || 1, inst: o.inst, hose: o.hose, spin: o.spin, center: o.center, ghost: !!o.ghost, coolant: !!o.coolant, fade: !!o.fade };
      items.push(it); return it;
    };
    const F = g.frame, P = ports();
    const hexNut = (r, h) => cylinder(r, h, 6);
    const wire = (part, pts, r, kind) => add(part, sweep(catmull(pts, 4), r, 10), kind);
    const ring = (c, R, rt, plane) => ringMesh(c, R, rt, plane);
    // ================= swirl pot V3 =================
    const sp = g.pot, B = sp.base, exPot = [0, 140, 0];
    const bp = barbProfile(sp.nipL, sp.nipRo, sp.outRi, 4).map(([r, y]) => [r, B - sp.cone - y]).reverse();
    add('pot', lathe(bp, 48), 0, { ex: exPot, cut: true });
    add('pot', lathe([[sp.nipRo, B - sp.cone], [sp.ro, B], [sp.ro, B + sp.body]], 72), 0, { cut: true });
    add('pot', lathe([[sp.ri, B + sp.body], [sp.ri, B], [sp.outRi, B - sp.cone]], 72), 0, { cut: true });
    add('pot', lathe([[sp.outRi, B - sp.cone], [sp.nipRo, B - sp.cone]], 48), 0, { cut: true });
    const top = B + sp.body;
    add('pot', lathe([[sp.open / 2, top + sp.capT], [sp.capD / 2 - 1, top + sp.capT], [sp.capD / 2, top + sp.capT - 1], [sp.capD / 2, top], [sp.ri, top]], 72), 0, { cut: true });
    const zI = sp.inletZ, x0 = Math.sqrt(Math.max(0, sp.ri * sp.ri - zI * zI)) - 2, yI = B + sp.inletY;
    add('pot', sweep(linePts([x0, yI, zI], [sp.inletEnd[0] - 30, yI, zI], 4), sp.tubeRo, 32), 0, { cut: true });
    add('pot', sweep(linePts([x0, yI, zI], [sp.inletEnd[0] - 30, yI, zI], 4), sp.tubeRo - sp.wall, 32), 0, { cut: true });
    add('pot', along(lathe(barbProfile(30, sp.tubeRo, sp.tubeRo - sp.wall, 3), 32), [1, 0, 0]), 0, { center: [sp.inletEnd[0] - 30, yI, zI] });
    // filler neck welded into the 1.0" opening, chrome pressure cap with ears and warning label, overflow nipple
    const nb = top + sp.capT, nr = sp.open / 2;
    add('pot', lathe([[nr - 1.2, nb - 2], [nr, nb - 2], [nr, nb + 18], [nr + 3, nb + 19], [nr + 7, nb + 19], [nr + 7.5, nb + 21], [nr - 1.2, nb + 21]], 56), 8, { cut: true });
    add('pot', lathe([[0, nb + 32], [17, nb + 31], [21.5, nb + 29.5], [22.5, nb + 26], [22.5, nb + 21.5], [12, nb + 21.5]], 72), 22);
    add('pot', merge([roundedBox(9, 6, 13, 2, 2), [24, nb + 25, 0]], [roundedBox(9, 6, 13, 2, 2), [-24, nb + 25, 0]]), 22);
    add('pot', merge([cylinder(13, 0.8, 48), [0, nb + 32.2, 0]]), 23);
    add('pot', merge([cylinder(4, 3, 24), [0, nb + 33.6, 0]]), 22);
    this.overflowNip = [nr + 18, nb + 10, 0];
    add('pot', sweep(linePts([nr - 1, nb + 10, 0], this.overflowNip, 3), 3.2, 16), 8);
    add('pot', sweep(arcPts([this.overflowNip[0] - 3, nb + 10, 0], 3.7, 0, Math.PI * 2, 'yz', 18), 0.8, 6, true), 8);
    // TIG welds
    add('pot', ring([0, top + 0.6, 0], sp.ro + 0.5, 1.25, 'xz'), 7);
    add('pot', ring([0, nb + 0.4, 0], nr + 0.6, 1.05, 'xz'), 7);
    add('pot', ring([0, B - sp.cone - 0.3, 0], sp.nipRo + 0.4, 1.05, 'xz'), 7);
    add('pot', ring([Math.sqrt(Math.max(0, sp.ro * sp.ro - zI * zI)) + 1.5, yI, zI], sp.tubeRo + 0.4, 1.15, 'yz'), 7);
    // stainless band clamp + rubber liner + tab
    add('pot', ring([0, B + 38, 0], sp.ro + 2.6, 1.9, 'xz'), 8);
    add('pot', ring([0, B + 38, 0], sp.ro + 0.9, 1.0, 'xz'), 9);
    add('mounts', merge([roundedBox(25.4, 22, Math.abs(F.zb) - sp.ro - 6, 1.5, 2), [0, B + 38, (F.zb - sp.ro - 4) / 2]]), 12);
    // ================= pump: Davies Craig EBP40 (envelope approximate) =================
    const pc = g.pump.c, exP = [120, 110, 120];
    add('pump', merge([lathe([[0, -70], [26, -70], [30, -66], [31, -60], [31, 6], [33, 8], [33, 10], [0, 10]], 56), pc]), 6, { ex: exP });
    { const rib = new GB(); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; rib.add(roundedBox(3, 40, 3, 1, 1), [pc[0] + Math.cos(a) * 31.5, pc[1] - 40, pc[2] + Math.sin(a) * 31.5]); } add('pump', rib.done(), 6); }
    add('pump', merge([lathe([[0, 10], [41, 10], [43, 13], [43, 40], [40, 44], [12, 46], [10, 46]], 64), pc]), 6);
    add('pump', merge([roundedBox(26, 30, 30, 8, 3), [pc[0] + 30, pc[1] + 27, pc[2] + 22]]), 6);
    add('pump', merge([cylinder(31.8, 6, 56), [pc[0], pc[1] - 18, 0]]), 23);
    add('pump', merge([lathe(barbProfile(36, 9.5, 7.9, 3), 32), [pc[0], pc[1] + 46, 0]]), 6);
    add('pump', along(lathe(barbProfile(40, 9.5, 7.9, 3), 32), [1, 0, 0]), 6, { center: [pc[0] + 40, pc[1] + 27, 0] });
    add('pump', merge([roundedBox(14, 18, 12, 3, 2), [pc[0], pc[1] - 74, pc[2] - 14]]), 27);
    wire('pump', [[pc[0] - 3, pc[1] - 80, pc[2] - 16], [pc[0] - 6, pc[1] - 110, pc[2] - 70], [pc[0] - 40, pc[1] - 120, F.zb + 16]], 1.6, 25);
    wire('pump', [[pc[0] + 3, pc[1] - 80, pc[2] - 16], [pc[0] + 2, pc[1] - 112, pc[2] - 72], [pc[0] - 34, pc[1] - 124, F.zb + 16]], 1.6, 4);
    add('pump', ring([pc[0], pc[1] - 30, 0], 33.5, 1.8, 'xz'), 8);
    add('mounts', merge([roundedBox(25.4, 18, Math.abs(F.zb) - 36, 1.5, 2), [pc[0], pc[1] - 30, (F.zb - 36) / 2]]), 12);
    // ================= Y fittings (billet aluminium) =================
    const yfit = (c, flip, part, ex) => {
      const sgn = flip ? -1 : 1, legs = [[[0, 46 * sgn, 0], 9.5, 7.9, 12], [[-31, -44 * sgn, 0], 0.4375 / 2 * 25.4, 4.2, 9], [[31, -44 * sgn, 0], 0.5625 / 2 * 25.4, 5.6, 10.5]];
      const body = new GB();
      body.add(roundedBox(30, 30, 38.1, 9, 5), [0, 0, 0]);
      for (const [to, ro, ri, rArm] of legs) {
        const d = nrm(to), L = Math.hypot(to[0], to[1]);
        body.add(sweep(linePts([0, 0, 0], [d[0] * L * 0.5, d[1] * L * 0.5, 0], 2), rArm, 32), [0, 0, 0]);
        body.add(along(hexNut(rArm + 2.5, 7), d), [d[0] * L * 0.52, d[1] * L * 0.52, 0]);
      }
      add(part, merge([body.done(), c]), 0, { ex, cut: true });
      const bb = new GB();
      for (const [to, ro, ri] of legs) { const d = nrm(to), L = Math.hypot(to[0], to[1]) * 0.46; bb.add(along(lathe(barbProfile(L, ro, ri, 3), 32), d), [c[0] + to[0] - d[0] * L, c[1] + to[1] - d[1] * L, c[2]]); }
      add(part, bb.done(), 8);
    };
    yfit(g.ySplit.c, false, 'ysplit', [0, 60, 170]);
    yfit(g.yMerge.c, true, 'ymerge', [0, -40, 170]);
    // ================= EMRAX 228 =================
    const mc = g.motor.c, mR = g.motor.D / 2, mL = g.motor.L, exM = [-200, 0, 140];
    const rim = []; rim.push([mR - 10, -mL / 2]); for (let k = 0; k <= 12; k++) { const y = -mL / 2 + 6 + k * (mL - 12) / 12; rim.push([k % 2 ? mR - 2.2 : mR, y]); } rim.push([mR - 6, mL / 2 - 1], [mR - 12, mL / 2]);
    add('motor', xf(lathe(rim, 128), toZ), 14, { ex: exM, center: mc });
    add('motor', xf(lathe([[36, mL / 2 - 4], [mR - 10, mL / 2 - 4]], 128), toZ), 18, { center: mc });
    add('motor', xf(lathe([[40, mL / 2 - 14], [mR - 16, mL / 2 - 14]], 96), toZ), 19, { center: mc });
    add('motor', xf(lathe([[mR - 14, mL / 2 - 14], [mR - 14, -mL / 2 + 10], [30, -mL / 2 + 10]], 96), toZ), 6, { center: mc });
    add('motor', xf(lathe([[0, mL / 2 + 14], [26, mL / 2 + 14], [36, mL / 2 + 6], [38, mL / 2 - 4]], 64), toZ), 0, { center: mc });
    add('motor', xf(lathe([[0, mL / 2 + 46], [17, mL / 2 + 46], [20, mL / 2 + 42], [20, mL / 2 + 14]], 48), toZ), 8, { center: mc });
    { const bt = new GB(); for (let k = 0; k < 10; k++) { const a = (k + 0.5) / 10 * Math.PI * 2; bt.add(xf(hexNut(4.2, 4), toZ), [Math.cos(a) * (mR - 6), Math.sin(a) * (mR - 6), mL / 2 - 2]); } for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; bt.add(xf(hexNut(3.4, 4), toZ), [Math.cos(a) * 29, Math.sin(a) * 29, mL / 2 + 15]); } add('motor', bt.done(), 8, { center: mc }); }
    add('motor', xf(lathe([[0, -mL / 2 - 10], [70, -mL / 2 - 10], [72, -mL / 2 - 8], [72, -mL / 2 + 2], [0, -mL / 2 + 2]], 72), toZ), 0, { center: mc });
    { const fb = new GB(); for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; fb.add(xf(hexNut(4, 5), toZ), [Math.cos(a) * 60, Math.sin(a) * 60, -mL / 2 - 12]); } add('motor', fb.done(), 8, { center: mc }); }
    for (const pp of [P.motorIn, P.motorOut]) add('motor', xf(lathe(barbProfile(26, 0.4375 / 2 * 25.4, 4.2, 3), 28), toNZ), 0, { center: [pp[0], pp[1], pp[2] + 26] });
    // phase-lead glands on the stator side
    const glands = [[-30, 52], [0, 58], [30, 52]];
    for (const [gx, gy] of glands) add('motor', xf(cylinder(8, 14, 24), toZ), 15, { center: [mc[0] + gx, mc[1] + gy, -mL / 2 - 16] });
    add('mounts', merge([roundedBox(25.4, 22, Math.abs(F.zb) - mL / 2 - 12, 1.5, 2), [mc[0] - 90, mc[1], (F.zb - mL / 2 - 12) / 2]], [roundedBox(25.4, 22, Math.abs(F.zb) - mL / 2 - 12, 1.5, 2), [mc[0] - 50, mc[1] + 90, (F.zb - mL / 2 - 12) / 2]], [roundedBox(25.4, 22, Math.abs(F.zb) - mL / 2 - 12, 1.5, 2), [mc[0] - 50, mc[1] - 90, (F.zb - mL / 2 - 12) / 2]]), 12);
    // ================= DTI HV-500LC =================
    const ic = g.inv.c, iL = g.inv.L, iH = g.inv.Hh, iW = g.inv.Wd, exI = [200, 0, 140];
    add('inv', roundedBox(iL, iH - 10, iW, 6, 4), 13, { ex: exI, center: [ic[0], ic[1] - 5, ic[2]] });
    add('inv', roundedBox(iL - 16, 10, iW - 16, 4, 3), 13, { center: [ic[0], ic[1] + iH / 2 - 6, ic[2]] });
    { const sc = new GB(); for (let k = 0; k < 7; k++) for (const zz of [-1, 1]) sc.add(cylinder(2.6, 1.6, 12), [ic[0] - iL / 2 + 20 + k * (iL - 40) / 6, ic[1] + iH / 2 - 0.6, ic[2] + zz * (iW / 2 - 14)]); add('inv', sc.done(), 8); }
    add('inv', roundedBox(110, 1, 46, 3, 2), 21, { center: [ic[0] - 60, ic[1] + iH / 2, ic[2] + 30] });
    { const ear = new GB(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { ear.add(roundedBox(26, 8, 22, 3, 2), [ic[0] + sx * (iL / 2 - 30), ic[1] - iH / 2 + 4, ic[2] + sz * (iW / 2 + 9)]); } add('inv', ear.done(), 13); }
    const hvx = ic[0] + iL / 2 + 6, conn = [[ic[1] + 4, ic[2] + 62], [ic[1] + 4, ic[2] + 20], [ic[1] + 4, ic[2] - 22], [ic[1] + 4, ic[2] - 64]];
    for (const [cy, cz] of conn) add('inv', xf(roundedBox(30, 24, 30, 5, 2), (v) => v), 15, { center: [hvx + 4, cy, cz] });
    add('inv', roundedBox(26, 18, 40, 3, 2), 27, { center: [ic[0] - iL / 2 + 60, ic[1] + 10, ic[2] - iW / 2 - 8] });
    for (const pp of [P.invIn, P.invOut]) add('inv', along(sweep(linePts([0, 0, 0], [0, 34, 0], 2), 7, 24), [-1, 0, 0]), 0, { center: [pp[0] + 34, pp[1], pp[2]] });
    // orange HV cables: three phases to the motor, DC pair out to the accumulator
    const mrear = [mc[0], mc[1], -mL / 2 - 24];
    for (let k = 0; k < 3; k++) {
      const [cy, cz] = conn[k + 1], [gx, gy] = glands[k];
      wire('hv', [[hvx + 18, cy, cz], [hvx + 50, cy - 10, cz - 20], [hvx + 40, ic[1] - 80 - k * 12, -150], [ic[0] - 80, ic[1] - 100 - k * 12, -172 + k * 4], [mc[0] + 40, mc[1] - 60 - k * 10, -170 + k * 4], [mc[0] + gx * 1.3, mc[1] + gy + 40, -mL / 2 - 70], [mc[0] + gx, mc[1] + gy, -mL / 2 - 22]], 6.2, 15);
    }
    wire('hv', [[hvx + 18, conn[0][0], conn[0][1]], [hvx + 70, conn[0][0] - 10, conn[0][1] + 10], [hvx + 110, ic[1] - 140, 40], [hvx + 120, F.y0 + 30, 0]], 6.2, 15);
    wire('hv', [[ic[0] - iL / 2 + 60, ic[1] + 10, ic[2] - iW / 2 - 28], [ic[0] - iL / 2 + 40, ic[1] + 40, F.zb + 40], [ic[0] - iL / 2 - 60, ic[1] + 60, F.zb + 16]], 3.2, 4);
    add('mounts', merge([roundedBox(25.4, 18, Math.abs(F.zb) - iW / 2 - 18, 1.5, 2), [ic[0] - iL / 2 + 30, ic[1] - iH / 2 + 4, (F.zb - iW / 2 - 18) / 2]], [roundedBox(25.4, 18, Math.abs(F.zb) - iW / 2 - 18, 1.5, 2), [ic[0] + iL / 2 - 30, ic[1] - iH / 2 + 4, (F.zb - iW / 2 - 18) / 2]]), 12);
    // ================= radiator =================
    const rc = g.rad.c, R = g.rad, exR = [0, -110, 170];
    const N = radR.N, rows = radR.rows, Th = RADCORE.Th, Fl = RADCORE.Fl, coreH = N * Th + rows * Fl;
    this.rad = { c: rc, N, rows, coreH, W: R.coreW, D: R.coreD };
    const inst = [], y0 = rc[1] - coreH / 2; this.tubeY = [];
    for (let t = 0; t < N; t++) { const y = y0 + Fl * (t + 1) + Th * (t + 0.5); this.tubeY.push(y); inst.push(rc[0], y, rc[2], 0, 0, t, 0); }
    for (let k = 0; k < rows; k++) inst.push(rc[0], y0 + k * (Fl + Th) + Fl / 2, rc[2], 0, 0, k, 0);
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(inst), gl.STATIC_DRAW);
    add('radiator', stadiumTube(R.coreW + 8, Th, R.coreD), 1, { ex: exR, inst: { base: 0, count: N }, cut: true });
    add('radiator', finRow(R.coreW, Fl, R.coreD, RADCORE.Fp), 2, { inst: { base: N, count: rows }, cut: true });
    for (const sx of [-1, 1]) {
      const tx = rc[0] + sx * (R.coreW / 2 + R.tankW / 2), hx = rc[0] + sx * (R.coreW / 2 + 1.6);
      add('radiator', merge([roundedBox(R.tankW, R.H, R.D, Math.min(R.tankW, R.D) * 0.42, 7), [tx, rc[1], rc[2]]]), 0, { cut: true });
      add('radiator', merge([roundedBox(3.2, R.H + 4, R.D + 4, 1.4, 3), [hx, rc[1], rc[2]]]), 8, { cut: true });
      const rr = Math.min(R.tankW, R.D) * 0.42, aa = R.H / 2 - rr, bbz = R.D / 2 - rr, seg = (cy, cz, a0) => arcPts([0, cy, cz], rr + 0.2, a0, a0 + Math.PI / 2, 'yz', 8);
      add('radiator', merge([sweep(joinPts(seg(aa, bbz, 0), seg(-aa, bbz, Math.PI / 2), seg(-aa, -bbz, Math.PI), seg(aa, -bbz, Math.PI * 1.5)), 1.15, 10, true), [rc[0] + sx * (R.coreW / 2 + 3.4), rc[1], rc[2]]]), 7, { cut: true });
      add('radiator', merge([roundedBox(20, 12, 5, 2, 2), [tx, rc[1] - R.H / 2 - 6, -R.D / 2 + 8]]), 0);
      add('mounts', merge([sweep(arcPts([tx, rc[1] - R.H / 2 - 8, -R.D / 2 + 8], 4.8, 0, Math.PI * 2, 'xy', 24), 2.3, 10, true), [0, 0, 0]], [xf(cylinder(2.6, 18, 6), toZ), [tx, rc[1] - R.H / 2 - 8, -R.D / 2 + 8]]), 9);
    }
    add('radiator', merge([roundedBox(R.coreW + 4, 2.4, R.coreD - 2, 1, 2), [rc[0], rc[1] + coreH / 2 + 1.2, rc[2]]], [roundedBox(R.coreW + 4, 2.4, R.coreD - 2, 1, 2), [rc[0], rc[1] - coreH / 2 - 1.2, rc[2]]]), 0);
    add('radiator', merge([lathe(barbProfile(38, 9.5, 7.9, 3), 32), g.radIn]), 0);
    add('radiator', along(lathe(barbProfile(38, 9.5, 7.9, 3), 32), [1, 0, 0]), 0, { center: [g.radOut[0] + 19, g.radOut[1], 0] });
    add('radiator', merge([ring([g.radIn[0], g.radIn[1] + 0.6, 0], 9.9, 1.0, 'xz'), [0, 0, 0]]), 7);
    add('radiator', merge([ring([g.radOut[0] + 0.6, g.radOut[1], 0], 9.9, 1.0, 'yz'), [0, 0, 0]]), 7);
    add('mounts', merge([roundedBox(25.4, 8, Math.abs(F.zb) - R.D / 2 + 8, 1.5, 2), [rc[0] - R.coreW / 2 - R.tankW / 2, rc[1] - R.H / 2 - 16, (F.zb - R.D / 2 + 8) / 2]], [roundedBox(25.4, 8, Math.abs(F.zb) - R.D / 2 + 8, 1.5, 2), [rc[0] + R.coreW / 2 + R.tankW / 2, rc[1] - R.H / 2 - 16, (F.zb - R.D / 2 + 8) / 2]]), 12);
    // ================= shroud + SPAL fan =================
    const zS0 = rc[2] - R.coreD / 2, zS1 = zS0 - g.shroudLen, exF = [0, -110, -40];
    add('shroud', merge([shroudLoft(R.coreW + 6, R.coreH + 6, g.fan.D / 2 + 2, zS0, zS1), [rc[0], rc[1], 0]]), 16, { ex: exF });
    { const fw = R.coreW + 6, fh = R.coreH + 6, t = 10; add('shroud', merge([roundedBox(fw + 2 * t, t, 3, 1, 2), [rc[0], rc[1] + fh / 2 + t / 2, zS0 - 1.5]], [roundedBox(fw + 2 * t, t, 3, 1, 2), [rc[0], rc[1] - fh / 2 - t / 2, zS0 - 1.5]], [roundedBox(t, fh, 3, 1, 2), [rc[0] - fw / 2 - t / 2, rc[1], zS0 - 1.5]], [roundedBox(t, fh, 3, 1, 2), [rc[0] + fw / 2 + t / 2, rc[1], zS0 - 1.5]]), 16); }
    add('shroud', merge([xf(lathe([[g.fan.D / 2 + 2, 0], [g.fan.D / 2 + 9, 0], [g.fan.D / 2 + 9, 3], [g.fan.D / 2 + 2, 3]], 96), toZ), [rc[0], rc[1], zS1 - 3]]), 16);
    const fc = g.fan.c, fR = g.fan.D / 2, exFan = [0, -110, -140];
    add('fan', merge([xf(lathe([[fR - 4, -15], [fR, -15], [fR, 13], [fR + 3, 15], [fR - 4, 15], [fR - 4, -15]], 112), toZ), [fc[0], fc[1], fc[2] + 11]]), 6, { ex: exFan });
    { const ears = new GB(), bolts = new GB(); for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const ex_ = fc[0] + ax * g.fan.holes / 2, ey = fc[1] + ay * g.fan.holes / 2; ears.add(roundedBox(26, 26, 5, 6, 3), [ex_ - ax * 6, ey - ay * 6, fc[2] + 24]); ears.add(sweep(linePts([fc[0] + ax * fR * 0.66, fc[1] + ay * fR * 0.66, fc[2] + 24], [ex_ - ax * 8, ey - ay * 8, fc[2] + 24], 2), 4, 10), [0, 0, 0]); bolts.add(xf(hexNut(5, 6), toZ), [ex_, ey, fc[2] + 28]); bolts.add(xf(cylinder(3.25, 14, 12), toZ), [ex_, ey, fc[2] + 22]); } add('fan', ears.done(), 6); add('fan', bolts.done(), 8); }
    add('fan', merge([xf(lathe([[0, -34], [30, -34], [34, -30], [34, 8], [0, 8]], 64), toZ), [fc[0], fc[1], fc[2] - 4]]), 6);
    add('fan', merge([xf(cylinder(22, 0.8, 48), toZ), [fc[0], fc[1], fc[2] - 38.6]]), 21);
    { const st = new GB(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; st.add(sweep(linePts([Math.cos(a) * 32, Math.sin(a) * 32, 0], [Math.cos(a) * (fR - 3), Math.sin(a) * (fR - 3), 0], 2), 2.6, 10), [fc[0], fc[1], fc[2] - 16]); } add('fan', st.done(), 6); }
    add('fan', bladeMesh(fR - 6, 36, 10), 6, { spin: [fc[0], fc[1], fc[2] + 8] });
    wire('fan', [[fc[0] + 20, fc[1] - 30, fc[2] - 34], [fc[0] + 60, fc[1] - 70, fc[2] - 50], [fc[0] + 160, fc[1] - 60, F.zb + 16]], 1.8, 4);
    // ================= catch can =================
    const cc = g.catchCan.c, cR = g.catchCan.D / 2, cH = g.catchCan.H, exC = [-180, 160, -110];
    const body = [[0, -cH / 2], [cR - 4, -cH / 2], [cR, -cH / 2 + 4]]; for (let k = 0; k < 6; k++) { const y = -cH / 2 + 14 + k * 3.2; body.push([cR, y], [cR - 1.2, y + 1.2], [cR, y + 2.4]); } body.push([cR, cH / 2 - 10], [cR - 1, cH / 2 - 6], [cR - 3, cH / 2 - 6]);
    add('can', merge([lathe(body, 72), cc]), 0, { ex: exC });
    add('can', merge([lathe([[cR - 3, cH / 2 - 6], [cR + 1, cH / 2 - 6], [cR + 1, cH / 2 + 10], [cR - 3, cH / 2 + 12], [0, cH / 2 + 12]], 72), cc]), 5);
    this.canIn = [cc[0] + 16, cc[1] + cH / 2 + 34, cc[2]]; this.canVent = [cc[0] - 16, cc[1] + cH / 2 + 30, cc[2]];
    add('can', merge([hexNut(8, 8), [this.canIn[0], cc[1] + cH / 2 + 16, cc[2]]], [hexNut(8, 8), [this.canVent[0], cc[1] + cH / 2 + 16, cc[2]]]), 24);
    add('can', merge([cylinder(3.2, 18, 16), [this.canIn[0], this.canIn[1] - 9, cc[2]]], [cylinder(3.2, 14, 16), [this.canVent[0], this.canVent[1] - 7, cc[2]]]), 8);
    // sight tube with water level
    const stx = cc[0] + cR + 8;
    add('can', merge([cylinder(5, cH - 30, 24), [stx, cc[1], cc[2] + 8]]), 11, { glass: true, alpha: 1 });
    add('can', merge([cylinder(3.6, (cH - 34) * 0.42, 20), [stx, cc[1] - (cH - 34) * 0.29, cc[2] + 8]]), 26, { glass: true, alpha: 0.85 });
    add('can', merge([roundedBox(14, 10, 12, 2, 2), [stx - 4, cc[1] + cH / 2 - 18, cc[2] + 8]], [roundedBox(14, 10, 12, 2, 2), [stx - 4, cc[1] - cH / 2 + 18, cc[2] + 8]]), 0);
    add('can', ring([cc[0], cc[1], cc[2]], cR + 1.6, 1.8, 'xz'), 8);
    add('mounts', merge([roundedBox(25.4, 22, Math.abs(F.zb - cc[2]) - cR, 1.5, 2), [cc[0], cc[1], (F.zb + cc[2] - cR) / 2]]), 12);
    const ov = catmull([this.overflowNip, [this.overflowNip[0] + 20, this.overflowNip[1] + 12, -20], [cc[0] + 40, this.canIn[1] + 46, cc[2]], this.canIn], 4);
    add('lines', sweep(ov, 4.3, 16), 11, { glass: true });
    add('lines', sweep(ov, 2.6, 10), 26, { glass: true, alpha: 0.5 });
    const vent = catmull([this.canVent, [this.canVent[0] - 10, this.canVent[1] + 30, cc[2]], [cc[0] - cR - 30, cc[1], cc[2] - 20], [cc[0] - cR - 40, F.y0 + 20, cc[2] - 30]], 6);
    add('lines', sweep(vent, 3.2, 12), 11, { glass: true });
    // ================= hoses, nylon clamps, sensors =================
    this.hoseGeo = {};
    for (const r of runs) {
      const d = hoseDims[r.line], ri = d.ID / 2, ro = d.OD / 2;
      add(r.id, sweep(r.path, ri * 0.97, 28), 10, { coolant: true, glass: true, alpha: 0.78, len: r.L, hose: r.id, cut: true });
      add(r.id, sweep(r.path, ro, 32), 11, { glass: true, alpha: 1, cut: true });
      const cl = new GB();
      for (const k of [0.012, 0.988]) {
        const s = this.pathAt(r.path, k), dd = this.pathDir(r.path, k), u = nrm(cross(dd, Math.abs(dd[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), w = cross(dd, u), rp = [];
        for (let a = 0; a <= 48; a++) { const t = a / 48 * Math.PI * 2; rp.push([s[0] + (u[0] * Math.cos(t) + w[0] * Math.sin(t)) * (ro + 1.2), s[1] + (u[1] * Math.cos(t) + w[1] * Math.sin(t)) * (ro + 1.2), s[2] + (u[2] * Math.cos(t) + w[2] * Math.sin(t)) * (ro + 1.2)]); }
        cl.add(sweep(rp, 1.6, 6, true), [0, 0, 0]);
        cl.add(roundedBox(6, 6, 6, 1.5, 1), [s[0] + u[0] * (ro + 4), s[1] + u[1] * (ro + 4), s[2] + u[2] * (ro + 4)]);
      }
      add(r.id, cl.done(), 6);
      if (r.sensor) {
        const k = 0.5, s = this.pathAt(r.path, k), dd = this.pathDir(r.path, k), up = nrm(cross(dd, [0, 0, 1])), flow = r.sensor === 'flow';
        add(r.id, merge([along(cylinder(ro + 3.5, flow ? 48 : 26, 36), dd), s]), flow ? 6 : 0);
        if (!flow) add(r.id, merge([along(hexNut(ro + 4.5, 8), dd), s]), 0);
        const tip = [s[0] + up[0] * (ro + 14), s[1] + up[1] * (ro + 14), s[2] + up[2] * (ro + 14)];
        add(r.id, merge([along(flow ? roundedBox(18, 16, 22, 3, 2) : hexNut(6.5, 12), up), [s[0] + up[0] * (ro + 7), s[1] + up[1] * (ro + 7), s[2] + up[2] * (ro + 7)]]), flow ? 6 : 8);
        add(r.id, merge([along(cylinder(5, 12, 16), up), tip]), 27);
        wire(r.id, [[tip[0] + up[0] * 6, tip[1] + up[1] * 6, tip[2] + up[2] * 6], [tip[0] + up[0] * 30, tip[1] + up[1] * 30 + 10, tip[2] - 30], [tip[0] * 0.9, tip[1] + 20, F.zb + 16]], 1.5, 4);
      }
      this.hoseGeo[r.id] = { path: r.path, cum: this.cumLen(r.path), L: r.L, ri };
    }
    // ================= frame: 1" tube members near each mount, faded at the ends =================
    const member = (y, xa, xb, z = F.zb) => { const p = linePts([xa, y, z], [xb, y, z], 2); add('frame', sweep(p, 12.7, 24), 12, { fade: true, len: Math.abs(xb - xa) }); };
    member(B + 38, -260, 220); member(pc[1] - 30, -200, 220); member(ic[1] - iH / 2 + 4, ic[0] - iL / 2 - 80, ic[0] + iL / 2 + 120); member(mc[1], mc[0] - 220, mc[0] + 60);
    member(mc[1] + 90, mc[0] - 200, mc[0] + 80); member(mc[1] - 90, mc[0] - 200, mc[0] + 80); member(cc[1], cc[0] - 140, cc[0] + 120); member(rc[1] - R.H / 2 - 16, rc[0] - 260, rc[0] + 260);
    const post = (x, ya, yb, z = F.zb) => add('frame', sweep(linePts([x, ya, z], [x, yb, z], 2), 12.7, 24), 12, { fade: true, len: Math.abs(yb - ya) });
    post(-500, -40, 1250); post(560, -40, 1250);
    // floor
    const fl = new GB(); const S = 5000; { const a = fl.v([-S, 0, -S], [0, 1, 0]), b = fl.v([S, 0, -S], [0, 1, 0]), c = fl.v([S, 0, S], [0, 1, 0]), d = fl.v([-S, 0, S], [0, 1, 0]); fl.q(a, b, c, d); }
    this.floor = this.up(fl.done()); this.floorY = F.y0 - 14;
    this.home = { c: [40, 600, 0], r: 760 }; if (!this.bounds) this.bounds = { c: [...this.home.c], r: this.home.r }; this.goal = this.goal || { c: [...this.home.c], r: this.home.r };
    this.focusSets = { loop: this.home, pot: { c: [0, GEO.pot.base + 10, 0], r: 165 }, pump: { c: [0, 690, 0], r: 200 }, branches: { c: [-10, 470, 0], r: 430 }, radiator: { c: [0, 75, -30], r: 240 } };
    this.ensureParticles(true);
  }
  cumLen(path) { const c = [0]; for (let i = 1; i < path.length; i++) c.push(c[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2])); return c; }
  pathAt(path, k) { const c = this.cumLen(path), L = c[c.length - 1] * k; return this.sampleCum(path, c, L); }
  pathDir(path, k) { const a = this.pathAt(path, Math.max(0, k - 0.01)), b = this.pathAt(path, Math.min(1, k + 0.01)); return nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]); }
  sampleCum(path, c, s) {
    if (s <= 0) return path[0]; const L = c[c.length - 1]; if (s >= L) return path[path.length - 1];
    let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] < s) lo = m; else hi = m; }
    const f = (s - c[lo]) / Math.max(1e-6, c[hi] - c[lo]), a = path[lo], b = path[hi];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  // ---------- live state ----------
  setState(st) { // st: {Tlo,Thi, hoseT:{id:[Ta,Tb]}, hoseV:{id:m/s}, rad:{mapC,mapA,nx,TcIn,TaIn}, fanOn, potV}
    this.st = st; if (st.rad) this.uploadTemps(st.rad);
  }
  uploadTemps(r) {
    const gl = this.gl, nx = r.nx, rows = r.rows, N = r.N, d = new Uint8Array(nx * rows * 4), lo = this.st.Tlo, hi = this.st.Thi;
    const tn = (T) => Math.max(0, Math.min(255, Math.round((T - lo) / Math.max(0.1, hi - lo) * 255)));
    for (let k = 0; k < rows; k++) for (let i = 0; i < nx; i++) { const a = Math.min(N - 1, Math.max(0, k - 1)), b = Math.min(N - 1, k), o = (k * nx + i) * 4; d[o] = tn((r.mapC[a][i] + r.mapC[b][i]) / 2); d[o + 1] = tn((r.mapA[a][i] + r.mapA[b][i]) / 2); d[o + 2] = k < N ? tn(r.mapC[k][i]) : 0; d[o + 3] = 255; }
    gl.bindTexture(gl.TEXTURE_2D, this.tTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nx, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.tSize = [nx, rows];
  }
  ensureParticles() {
    this.pt = [];
    for (const r of this.runs) { const n = Math.max(6, Math.round(r.L / 14)); for (let i = 0; i < n; i++) this.pt.push({ h: r.id, s: Math.random() * r.L, j: (Math.random() - 0.5) * 0.7, k: Math.random() * Math.PI * 2 }); }
    this.swirl = []; for (let i = 0; i < 160; i++) this.swirl.push({ a: Math.random() * 6.28, y: Math.random(), r: 0.55 + Math.random() * 0.4 });
    this.radPt = []; for (let i = 0; i < 260; i++) this.radPt.push({ t: Math.floor(Math.random() * (this.rad ? this.rad.N : 10)), x: Math.random(), z: (Math.random() - 0.5) * 0.8 });
  }
  offsetOf(part) { const e = this.explode; const p = this.parts[part]; return p ? [p.ex[0] * e, p.ex[1] * e, p.ex[2] * e] : [0, 0, 0]; }
  // ---------- frame ----------
  focus(k) { const f = this.focusSets && this.focusSets[k]; if (!f) return; this.goal = { c: [...f.c], r: f.r }; this.pan = [0, 0]; this.zoom = 1; }
  frame(dt) {
    if (!this.items || !this.st) return;
    if (this.goal) { const a = Math.min(1, dt * 5); for (let i = 0; i < 3; i++) this.bounds.c[i] += (this.goal.c[i] - this.bounds.c[i]) * a; this.bounds.r += (this.goal.r - this.bounds.r) * a; }
    if (this.autoSpin) this.yaw += dt * 0.08;
    this.t += dt; if (this.st.fanOn) this.fanAng -= dt * 14;
    const slow = 1 / 12;
    for (const p of this.pt) { const v = (this.st.hoseV[p.h] || 0) * 1000 * slow; p.s += v * dt; const L = this.hoseGeo[p.h].L; if (p.s > L) p.s -= L; }
    for (const p of this.swirl) { p.a += dt * 4 * (1.2 - p.y); p.y += dt * 0.12; if (p.y > 1) p.y -= 1; }
    for (const p of this.radPt) { p.x += dt * Math.max(0.02, this.st.radV || 0.2) * 1000 * slow / (this.rad.W); if (p.x > 1) { p.x -= 1; p.t = Math.floor(Math.random() * this.rad.N); } }
    this.render();
  }
  ribbonVerts() {
    const out = [], push = (a, b, Ta, Tb, fa, fb) => { const e = [b[0] + (b[0] - a[0]), b[1] + (b[1] - a[1]), b[2] + (b[2] - a[2])]; out.push(...a, ...b, -1, Ta, fa, ...a, ...b, 1, Ta, fa, ...b, ...e, 1, Tb, fb, ...a, ...b, -1, Ta, fa, ...b, ...e, 1, Tb, fb, ...b, ...e, -1, Tb, fb); };
    const ex = this.explode > 0.02;
    if (this.flow && !ex) for (const p of this.pt) {
      const G = this.hoseGeo[p.h], T = this.st.hoseT[p.h] || [40, 40], v = this.st.hoseV[p.h] || 0; const tail = Math.max(6, v * 1000 / 12 * 0.22);
      const segs = 5; let prev = null;
      for (let k = 0; k <= segs; k++) {
        const s = p.s - tail * k / segs; if (s < 0) break;
        const c = this.sampleCum(G.path, G.cum, s), d = this.sampleCum(G.path, G.cum, Math.min(G.L, s + 1)), dir = nrm([d[0] - c[0], d[1] - c[1], d[2] - c[2]]);
        const u = nrm(cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), w = cross(dir, u), rr = G.ri * p.j;
        const q = [c[0] + (u[0] * Math.cos(p.k) + w[0] * Math.sin(p.k)) * rr, c[1] + (u[1] * Math.cos(p.k) + w[1] * Math.sin(p.k)) * rr, c[2] + (u[2] * Math.cos(p.k) + w[2] * Math.sin(p.k)) * rr];
        if (prev) push(prev, q, T[0], T[0], (1 - (k - 1) / segs) * 0.95, (1 - k / segs) * 0.95);
        prev = q;
      }
    }
    if (this.cut && this.flow && !ex) {
      const sp = GEO.pot, B = sp.base, Tp = this.st.potT || 40;
      for (const p of this.swirl) {
        let prev = null;
        for (let k = 0; k < 5; k++) {
          const a = p.a - k * 0.12, yy = p.y - k * 0.008, y = B + sp.inletY - yy * (sp.inletY + sp.cone * 0.9);
          const rad = y > B ? sp.ri * p.r : (sp.outRi + (sp.ri - sp.outRi) * Math.max(0, (y - (B - sp.cone)) / sp.cone)) * p.r;
          const q = [Math.cos(a) * rad, y, -Math.abs(Math.sin(a)) * rad - 0.5];
          if (prev) push(prev, q, Tp, Tp, 1 - (k - 1) / 5, 1 - k / 5); prev = q;
        }
      }
      const R = this.st.rad, rc = this.rad.c;
      if (R) for (const p of this.radPt) {
        const y = this.tubeY[p.t], x0 = rc[0] - this.rad.W / 2 + p.x * this.rad.W, x1 = x0 - 14; if (x1 < rc[0] - this.rad.W / 2) continue;
        const ix = Math.min(R.nx - 1, Math.floor(p.x * R.nx)), T = R.mapC[Math.min(R.N - 1, p.t)][ix];
        push([x1, y, -Math.abs(p.z) * this.rad.D * 0.4], [x0, y, -Math.abs(p.z) * this.rad.D * 0.4], T, T, 0.1, 0.9);
      }
    }
    return new Float32Array(out);
  }
  // ---------- drawing ----------
  bindMesh(m) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.p); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.n); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.u); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(2, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.i);
  }
  modelOf(it) {
    const o = this.offsetOf(it.part), c = it.center || [0, 0, 0];
    if (it.spin) return M4.mul(M4.tr(it.spin[0] + o[0], it.spin[1] + o[1], it.spin[2] + o[2]), M4.rz(this.fanAng));
    return M4.tr(o[0] + c[0], o[1] + c[1], o[2] + c[2]);
  }
  drawIt(it, prog) {
    const gl = this.gl, u = prog.u;
    gl.uniformMatrix4fv(u.uModel, false, this.modelOf(it));
    if (u.uCutOn) gl.uniform1i(u.uCutOn, this.cut && it.cut ? 1 : 0);
    this.bindMesh(it.mesh);
    if (it.inst) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 28, it.inst.base * 28); gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 28, it.inst.base * 28 + 12); gl.vertexAttribDivisor(4, 1);
      gl.drawElementsInstanced(gl.TRIANGLES, it.mesh.count, gl.UNSIGNED_INT, 0, it.inst.count);
      gl.vertexAttribDivisor(3, 0); gl.vertexAttribDivisor(4, 0); gl.disableVertexAttribArray(3); gl.disableVertexAttribArray(4);
    } else {
      gl.disableVertexAttribArray(3); gl.disableVertexAttribArray(4); gl.vertexAttrib3f(3, 0, 0, 0); gl.vertexAttrib4f(4, 0, 0, 0, 0);
      gl.drawElements(gl.TRIANGLES, it.mesh.count, gl.UNSIGNED_INT, 0);
    }
  }
  camera() {
    const cv = this.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
    const Wc = Math.max(1, Math.round(cv.clientWidth * dpr)), Hc = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== Wc || cv.height !== Hc) { cv.width = Wc; cv.height = Hc; }
    const aspect = Wc / Hc, fov = 0.55, b = this.bounds;
    const fit = b.r / Math.tan(Math.min(fov / 2, Math.atan(Math.tan(fov / 2) * aspect)));
    const dist = fit * 0.95 * this.zoom * (1 + 0.3 * this.explode);
    const cy = Math.cos(this.pitch);
    const right = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
    const tgt = [b.c[0] + right[0] * this.pan[0], b.c[1] + this.pan[1], b.c[2] + right[2] * this.pan[0]];
    const eye = [tgt[0] + Math.sin(this.yaw) * cy * dist, tgt[1] + Math.sin(this.pitch) * dist, tgt[2] + Math.cos(this.yaw) * cy * dist];
    const V = M4.look(eye, tgt, [0, 1, 0]), Pm = M4.persp(fov, aspect, Math.max(4, dist * 0.04), dist * 6 + 3000);
    Object.assign(this, { VP: M4.mul(Pm, V), V, Pm, eye, Wc, Hc, dpr });
  }
  tex(w, h, ifmt, fmt, type, filt) { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  fbo(color, depth) { const gl = this.gl, f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); if (color) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0); if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0); return f; }
  ensureTargets() {
    const gl = this.gl, W = this.Wc, H = this.Hc;
    if (this.tg && this.tg.W === W && this.tg.H === H) return this.tg.ok;
    const old = this.tg; if (old) { for (const t of old.texs) gl.deleteTexture(t); for (const f of old.fbs) gl.deleteFramebuffer(f); for (const r of old.rbs) gl.deleteRenderbuffer(r); }
    const t = this.tg = { W, H, texs: [], fbs: [], rbs: [], ok: false };
    try {
      const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1), qw = Math.max(1, W >> 2), qh = Math.max(1, H >> 2);
      t.msFB = gl.createFramebuffer(); const rc = gl.createRenderbuffer(), rd = gl.createRenderbuffer(); t.rbs.push(rc, rd);
      gl.bindRenderbuffer(gl.RENDERBUFFER, rc); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.RGBA16F, W, H);
      gl.bindRenderbuffer(gl.RENDERBUFFER, rd); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.DEPTH_COMPONENT24, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.msFB); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rc); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rd);
      t.resTex = this.tex(W, H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR); t.resFB = this.fbo(t.resTex);
      t.gN = this.tex(hw, hh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST); t.gD = this.tex(hw, hh, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST); t.gFB = this.fbo(t.gN, t.gD);
      t.ao = this.tex(hw, hh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR); t.aoFB = this.fbo(t.ao);
      t.aoB = this.tex(hw, hh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR); t.aoBFB = this.fbo(t.aoB);
      t.bA = this.tex(qw, qh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR); t.bAFB = this.fbo(t.bA);
      t.bB = this.tex(qw, qh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR); t.bBFB = this.fbo(t.bB);
      t.texs.push(t.resTex, t.gN, t.gD, t.ao, t.aoB, t.bA, t.bB); t.fbs.push(t.msFB, t.resFB, t.gFB, t.aoFB, t.aoBFB, t.bAFB, t.bBFB);
      Object.assign(t, { hw, hh, qw, qh });
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.msFB); t.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.resFB); t.ok = t.ok && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    } catch (e) { t.ok = false; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!t.ok) this.hdr = false;
    return t.ok;
  }
  fs(prog) { const gl = this.gl; gl.useProgram(prog); gl.bindVertexArray(this.fsVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); }
  render() {
    if (!this.ok) return;
    const gl = this.gl; this.camera();
    const st = this.st, ex = this.explode > 0.02;
    const post = this.hdr && this.ensureTargets(), T = this.tg;
    // shadows
    const ext = this.bounds.r * 1.15, L = this.Ldir, c = this.bounds.c, le = [c[0] + L[0] * 2500, c[1] + L[1] * 2500, c[2] + L[2] * 2500];
    const LV = M4.mul(M4.ortho(-ext, ext, -ext, ext, 300, 5200), M4.look(le, c, [0, 1, 0]));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFB); gl.viewport(0, 0, this.SM, this.SM); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.dprog); gl.uniformMatrix4fv(this.dprog.u.uVP, false, LV);
    for (const it of this.items) if (!it.glass && !(ex && (it.part === 'hv' || /^h\d/.test(it.part)))) this.drawIt(it, this.dprog);
    if (post) {
      // normal + depth prepass (half res) and SSAO
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.gFB); gl.viewport(0, 0, T.hw, T.hh); gl.clearColor(0.5, 0.5, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const G = this.gprog; gl.useProgram(G); gl.uniformMatrix4fv(G.u.uVP, false, this.VP); gl.uniformMatrix4fv(G.u.uV, false, this.V); gl.uniform1f(G.u.uCutZ, 0.5);
      gl.uniformMatrix4fv(G.u.uModel, false, M4.tr(0, this.floorY, 0)); gl.uniform1i(G.u.uCutOn, 0); this.bindMesh(this.floor); gl.disableVertexAttribArray(3); gl.disableVertexAttribArray(4); gl.drawElements(gl.TRIANGLES, this.floor.count, gl.UNSIGNED_INT, 0);
      for (const it of this.items) if (!it.glass && !(ex && (it.part === 'hv' || it.part === 'lines' || it.part === 'bleed' || /^h\d/.test(it.part)))) this.drawIt(it, G);
      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.aoFB);
      const S = this.ssaoProg; gl.useProgram(S);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.gD); gl.uniform1i(S.u.uD, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.gN); gl.uniform1i(S.u.uN, 1);
      gl.uniformMatrix4fv(S.u.uP, false, this.Pm); gl.uniformMatrix4fv(S.u.uIP, false, inv4(this.Pm)); gl.uniform3fv(S.u['uK[0]'], this.kernel); gl.uniform1f(S.u.uRad, 26);
      this.fs(S);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.aoBFB);
      const AB = this.aoBlurProg; gl.useProgram(AB);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.ao); gl.uniform1i(AB.u.uA, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.gD); gl.uniform1i(AB.u.uD, 1); gl.uniform2f(AB.u.uTx, 1 / T.hw, 1 / T.hh);
      this.fs(AB);
      gl.enable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.msFB);
    } else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.Wc, this.Hc);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // studio backdrop
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.useProgram(this.backProg); gl.uniform1i(this.backProg.u.uHDR, post ? 1 : 0); this.fs(this.backProg); gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    const P = this.prog, u = P.u; gl.useProgram(P);
    gl.uniformMatrix4fv(u.uVP, false, this.VP); gl.uniform3fv(u.uCam, this.eye); gl.uniform1f(u.uThermal, this.thermal);
    gl.uniform1f(u.uTlo, st.Tlo); gl.uniform1f(u.uThi, st.Thi); gl.uniform3fv(u.uLdir, L); gl.uniformMatrix4fv(u.uLightVP, false, LV);
    gl.uniform1f(u.uCutZ, 0.5); gl.uniform1f(u.uTime, this.t); gl.uniform1i(u.uHDR, post ? 1 : 0); gl.uniform1i(u.uUseAO, post ? 1 : 0); gl.uniform2f(u.uScreen, this.Wc, this.Hc); gl.uniform1f(u.uFade, 0);
    const ro = this.offsetOf('radiator');
    gl.uniform1f(u.uRW, this.rad.W); gl.uniform1f(u.uRD, this.rad.D); gl.uniform1f(u.uLp, RADCORE.Lp); gl.uniform1f(u.uTheta, RADCORE.theta);
    gl.uniform3f(u.uRC, this.rad.c[0] + ro[0], this.rad.c[1] + ro[1], this.rad.c[2] + ro[2]); gl.uniform2fv(u.uTempSize, this.tSize || [1, 1]);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.uniform1i(u.uShadow, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tTex); gl.uniform1i(u.uTemp, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, post ? T.aoB : this.tTex); gl.uniform1i(u.uAO, 2);
    gl.uniform1i(u.uKind, 3); gl.uniform1i(u.uCutOn, 0); gl.uniform1f(u.uAlpha, 1); gl.uniform1i(u.uSel, 0);
    gl.uniformMatrix4fv(u.uModel, false, M4.tr(0, this.floorY, 0)); this.bindMesh(this.floor); gl.disableVertexAttribArray(3); gl.disableVertexAttribArray(4); gl.drawElements(gl.TRIANGLES, this.floor.count, gl.UNSIGNED_INT, 0);
    const setIt = (it) => {
      gl.uniform1i(u.uKind, it.kind); gl.uniform1f(u.uAlpha, it.alpha); gl.uniform1i(u.uSel, this.sel === it.part ? 1 : 0);
      gl.uniform1f(u.uFade, it.fade ? 1 : 0); if (it.fade) gl.uniform1f(u.uLen, it.len);
      if (it.kind === 10) { const Tt = st.hoseT[it.hose] || [40, 40]; gl.uniform1f(u.uTa, Tt[0]); gl.uniform1f(u.uTb, Tt[1]); gl.uniform1f(u.uLen, it.len); }
    };
    const hideEx = (it) => ex && (it.part === 'hv' || it.part === 'lines' || it.part === 'bleed' || (/^h\d/.test(it.part) && !it.glass));
    for (const it of this.items) if (!it.glass && !hideEx(it)) { setIt(it); const fin = it.kind === 2; if (fin) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE); this.drawIt(it, P); if (fin) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE); }
    gl.enable(gl.BLEND); gl.depthMask(false);
    const rv = this.ribbonVerts();
    if (rv.length) {
      const R = this.rprog; gl.useProgram(R); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(R.u.uVP, false, this.VP); gl.uniform2f(R.u.uRes, this.Wc / 2, this.Hc / 2); gl.uniform1f(R.u.uWid, 1.6 * this.dpr); gl.uniform1f(R.u.uTlo, st.Tlo); gl.uniform1f(R.u.uThi, st.Thi); gl.uniform1i(R.u.uHDR, post ? 1 : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ribBuf); gl.bufferData(gl.ARRAY_BUFFER, rv, gl.STREAM_DRAW);
      for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribDivisor(i, 0); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); }
      gl.disableVertexAttribArray(3); gl.disableVertexAttribArray(4);
      gl.drawArrays(gl.TRIANGLES, 0, rv.length / 9);
      gl.useProgram(P);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const it of this.items) if (it.glass && it.coolant) { setIt(it); if (ex) gl.uniform1f(u.uAlpha, 0.12 * (1 - this.explode) + 0.02); this.drawIt(it, P); }
    for (const it of this.items) if (it.glass && !it.coolant && !hideEx(it)) { setIt(it); if (ex && it.kind === 11) gl.uniform1f(u.uAlpha, 0.25); this.drawIt(it, P); }
    gl.depthMask(true); gl.disable(gl.BLEND);
    if (post) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.msFB); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.resFB);
      gl.blitFramebuffer(0, 0, this.Wc, this.Hc, 0, 0, this.Wc, this.Hc, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.bAFB); gl.viewport(0, 0, T.qw, T.qh);
      const Br = this.brightProg; gl.useProgram(Br); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.resTex); gl.uniform1i(Br.u.uC, 0); gl.uniform2f(Br.u.uTx, 2 / this.Wc, 2 / this.Hc); this.fs(Br);
      const Bl = this.blurProg;
      for (let k = 0; k < 2; k++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.bBFB); gl.useProgram(Bl); gl.bindTexture(gl.TEXTURE_2D, T.bA); gl.uniform1i(Bl.u.uC, 0); gl.uniform2f(Bl.u.uDir, (1 + k) / T.qw, 0); this.fs(Bl);
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.bAFB); gl.bindTexture(gl.TEXTURE_2D, T.bB); gl.uniform2f(Bl.u.uDir, 0, (1 + k) / T.qh); this.fs(Bl);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.Wc, this.Hc);
      const Cp = this.compProg; gl.useProgram(Cp);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.resTex); gl.uniform1i(Cp.u.uC, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.bA); gl.uniform1i(Cp.u.uB, 1);
      gl.uniform1f(Cp.u.uExp, 0.95); gl.uniform2f(Cp.u.uRes, this.Wc, this.Hc); this.fs(Cp);
      gl.enable(gl.DEPTH_TEST);
    }
    this.placeLabels();
  }
  pickAt(cx, cy) {
    if (!this.items) return;
    const gl = this.gl, r = this.cv.getBoundingClientRect(), x = Math.round((cx - r.left) * this.dpr), y = Math.round(this.Hc - (cy - r.top) * this.dpr);
    if (!this.pickFB) {
      this.pickFB = gl.createFramebuffer(); this.pickTex = gl.createTexture(); this.pickDepth = gl.createRenderbuffer();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.pickTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.Wc, this.Hc, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.Wc, this.Hc);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pickTex, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.pickDepth);
    gl.viewport(0, 0, this.Wc, this.Hc); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const Pp = this.pprog; gl.useProgram(Pp); gl.uniformMatrix4fv(Pp.u.uVP, false, this.VP); gl.uniform1f(Pp.u.uCutZ, 0.5);
    for (const it of this.items) { if (it.kind === 11 && it.part !== 'lines') continue; const id = this.parts[it.part].pid; gl.uniform3f(Pp.u.uPickC, (id & 255) / 255, ((id >> 8) & 255) / 255, 0); this.drawIt(it, Pp); }
    const px = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const id = px[0] + px[1] * 256; let part = null; for (const k in this.parts) if (this.parts[k].pid === id) part = k;
    this.sel = part; this.onPick && this.onPick(part, [cx - r.left, cy - r.top]);
  }
  project(pt) {
    const m = this.VP, [x, y, z] = pt;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [(cx / cw * 0.5 + 0.5) * this.Wc / this.dpr, (1 - (cy / cw * 0.5 + 0.5)) * this.Hc / this.dpr, cw];
  }
  placeLabels() {
    if (!this.labelsEl) return;
    const P = ports(), add = (p, part) => { const o = this.offsetOf(part); return [p[0] + o[0], p[1] + o[1], p[2] + o[2]]; };
    const pts = { lpot: add([0, GEO.pot.top + 70, 0], 'pot'), lmin: add(P.motorIn, 'motor'), linv: add(P.invOut, 'inv'), lrin: add(GEO.radInEnd, 'radiator'), lrout: add(GEO.radOutEnd, 'radiator'), lfan: add([GEO.fan.c[0] + GEO.fan.D * 0.42, GEO.fan.c[1] - GEO.fan.D * 0.42, GEO.fan.c[2] - 20], 'fan') };
    const placed = [];
    for (const id in pts) {
      const el = this.labelsEl.querySelector('[data-k=' + id + ']'); if (!el) continue;
      const [x, y, w] = this.project(pts[id]);
      if ((id === 'lfan' && this.eye[2] > GEO.fan.c[2] + 60) || ((id === 'lmin' || id === 'linv') && this.eye[2] < -300)) { el.style.opacity = 0; continue; }
      let vis = w > 0 && x > 50 && x < this.Wc / this.dpr - 50 && y > 60 && y < this.Hc / this.dpr - 10 && getComputedStyle(el).display !== 'none';
      for (const q of placed) if (Math.abs(q[0] - x) < 130 && Math.abs(q[1] - y) < 44) vis = false;
      if (vis) placed.push([x, y]);
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; el.style.opacity = vis ? 1 : 0;
    }
  }
}
