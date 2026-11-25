// Shared layout of the cooling loop: component positions (mm) and hose centre-lines.
// x right, y up (gravity -y), z forward (air enters the radiator from +z).
const IN = 25.4;
const GEO = (() => {
  const g = {};
  // radiator: overall 11.75 x 4.875 x 3.8 in, core 9.25 x 4.5 x 2.0 in, side tanks, no reservoir
  g.rad = { c: [0, 90, 0], W: 11.75 * IN, H: 4.875 * IN, D: 3.8 * IN, coreW: 9.25 * IN, coreH: 4.5 * IN, coreD: 2.0 * IN };
  g.rad.tankW = (g.rad.W - g.rad.coreW) / 2;
  const rc = g.rad.c, rW = g.rad.W, rH = g.rad.H;
  g.radIn = [rc[0] - rW / 2 + g.rad.tankW / 2, rc[1] + rH / 2, 0]; // top of left tank, nipple up
  g.radInEnd = [g.radIn[0], g.radIn[1] + 38, 0];
  g.radOut = [rc[0] + rW / 2, rc[1] - rH / 2 + 22, 0]; // low on right tank, nipple outboard
  g.radOutEnd = [g.radOut[0] + 38, g.radOut[1], 0];
  // shroud + fan behind the core, lowest part of the system
  g.shroudLen = 70;
  g.fan = { D: 184, depth: 52.1, holes: 135, c: [rc[0], rc[1], -g.rad.coreD / 2 - g.shroudLen - 52.1 / 2] };
  // Y merge above radiator inlet, components in parallel, Y split, pump, swirl pot on top
  g.yMerge = { c: [g.radIn[0], 300, 0], flip: true };
  g.motor = { c: [-330, 470, 0], D: 228, L: 86 };
  g.inv = { c: [300, 470, 0], L: 420, Wd: 213, Hh: 77 };
  g.ySplit = { c: [0, 640, 0], flip: false };
  g.pump = { c: [0, 770, 0] };
  // swirl pot V3 (inches)
  const sp = g.pot = { ri: 1.25 * IN, ro: 2.625 / 2 * IN, body: 4.0 * IN, cone: 2.0 * IN, outRi: 0.625 / 2 * IN, nipRo: 0.75 / 2 * IN, nipL: 4.1 * IN, inletY: 3.4 * IN, capD: 2.75 * IN, capT: 0.125 * IN, open: 1.0 * IN, tubeRo: 0.75 / 2 * IN, wall: IN / 16 };
  sp.base = 900 + sp.nipL + sp.cone; // y of body bottom (cone top)
  sp.c = [0, sp.base, 0];
  sp.nipBot = [0, sp.base - sp.cone - sp.nipL, 0];
  sp.inletZ = -(sp.ri - (sp.tubeRo - sp.wall));
  sp.inletEnd = [sp.ri + 62, sp.base + sp.inletY, sp.inletZ];
  sp.top = sp.base + sp.body;
  g.catchCan = { c: [-150, 1010, -70], D: 3.5 * IN, H: 7.0 * IN, wall: 0.065 * IN };
  g.frame = { x: 640, zf: 190, zb: -200, y0: -40, y1: 1290 };
  return g;
})();
function catmull(pts, step = 6) {
  const out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    const n = Math.max(2, Math.ceil(seg / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function pathLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]); return L; }
function pathTurn(p) { // total turning angle (deg), used for bend losses
  let a = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const u = [p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]], v = [p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1], p[i + 1][2] - p[i][2]];
    const lu = Math.hypot(...u), lv = Math.hypot(...v); if (lu < 1e-6 || lv < 1e-6) continue;
    a += Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv))));
  }
  return a * 180 / Math.PI;
}
// Port positions of fittings/components (hose attachment points, at the end of each barb)
function ports() {
  const g = GEO, P = {};
  P.potOut = g.pot.nipBot;
  P.pumpIn = [g.pump.c[0], g.pump.c[1] + 82, 0];
  P.pumpOut = [g.pump.c[0] + 80, g.pump.c[1] + 27, 0];
  const ys = g.ySplit.c, ym = g.yMerge.c;
  // Y-fitting envelope 2.98 x 3.54 x 1.5 in: trunk barb tip 46 mm above centre, legs 44 mm below at +/-31 mm
  P.ySplitIn = [ys[0], ys[1] + 46, 0];
  P.ySplitM = [ys[0] - 31, ys[1] - 44, 0];
  P.ySplitI = [ys[0] + 31, ys[1] - 44, 0];
  P.yMergeOut = [ym[0], ym[1] - 46, 0];
  P.yMergeM = [ym[0] - 31, ym[1] + 44, 0];
  P.yMergeI = [ym[0] + 31, ym[1] + 44, 0];
  const m = g.motor;
  // EMRAX liquid ports sit on the stator (mounting) side near the centre
  P.motorIn = [m.c[0] + 48, m.c[1] + 26, -m.L / 2 - 34];
  P.motorOut = [m.c[0] + 48, m.c[1] - 26, -m.L / 2 - 34];
  const v = g.inv;
  P.invIn = [v.c[0] - v.L / 2 - 34, v.c[1] + 18, 50];
  P.invOut = [v.c[0] - v.L / 2 - 34, v.c[1] - 18, -50];
  P.radIn = g.radInEnd; P.radOut = g.radOutEnd;
  P.potIn = g.pot.inletEnd;
  return P;
}
// Hose runs: id, from, to, waypoints, line (pump/motor/inv/main/return)
function hoseRuns() {
  const P = ports(), g = GEO;
  const runs = [
    { id: 'h1', name: 'Swirl pot → pump', line: 'pump', pts: [P.potOut, [0, P.potOut[1] - 20, 0], [0, P.pumpIn[1] + 18, 0], P.pumpIn] },
    { id: 'h2', name: 'Pump → Y split', line: 'pump', pts: [P.pumpOut, [P.pumpOut[0] + 30, P.pumpOut[1] - 10, 0], [60, 712, 0], [P.ySplitIn[0] + 10, P.ySplitIn[1] + 26, 0], P.ySplitIn], sensor: 'flow' },
    { id: 'h3m', name: 'Y split → motor', line: 'motor', pts: [P.ySplitM, [P.ySplitM[0] - 30, P.ySplitM[1] - 40, 10], [-140, 560, -40], [P.motorIn[0] + 30, P.motorIn[1] + 16, P.motorIn[2] - 26], P.motorIn], sensor: 'Tmotor' },
    { id: 'h4m', name: 'Motor → Y merge', line: 'motor', pts: [P.motorOut, [P.motorOut[0] + 30, P.motorOut[1] - 16, P.motorOut[2] - 26], [-150, 380, -50], [P.yMergeM[0] - 30, P.yMergeM[1] + 40, 10], P.yMergeM] },
    { id: 'h3i', name: 'Y split → inverter', line: 'inv', pts: [P.ySplitI, [P.ySplitI[0] + 30, P.ySplitI[1] - 40, 10], [80, 520, 50], [P.invIn[0] - 20, P.invIn[1] + 4, P.invIn[2]], P.invIn] },
    { id: 'h4i', name: 'Inverter → Y merge', line: 'inv', pts: [P.invOut, [P.invOut[0] - 24, P.invOut[1] - 6, P.invOut[2]], [-30, 400, -30], [P.yMergeI[0] + 26, P.yMergeI[1] + 40, -10], P.yMergeI], sensor: 'Tinv' },
    { id: 'h5', name: 'Y merge → radiator in', line: 'main', pts: [P.yMergeOut, [P.yMergeOut[0], P.yMergeOut[1] - 25, 0], [P.radIn[0], P.radIn[1] + 22, 0], P.radIn], sensor: 'TradIn' },
    { id: 'h6', name: 'Return: radiator out → swirl pot', line: 'return', pts: [P.radOut, [P.radOut[0] + 40, P.radOut[1] + 4, -20], [250, 120, -150], [250, 700, -160], [210, 1000, -120], [P.potIn[0] + 60, P.potIn[1] - 8, P.potIn[2] - 10], P.potIn], sensor: 'TradOut' }
  ];
  for (const r of runs) { r.path = catmull(r.pts, 5); r.L = pathLen(r.path); r.turn = pathTurn(r.path); }
  return runs;
}
if (typeof module !== 'undefined') module.exports = { GEO, hoseRuns, ports, catmull, pathLen, pathTurn, IN };
