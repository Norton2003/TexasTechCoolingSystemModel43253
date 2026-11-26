// Cooling-loop layout in car coordinates (mm): x lateral (+ right), y up, z forward (+ toward the accumulator, − toward the rear).
// Arranged after the team's rear-bay screenshots: radiator + shroud + fan low at the very rear, EMRAX across the bay with
// its axis lateral, swirl pot at the top feeding straight down into the EBP40.
const IN = 25.4;
// Fitting orientations and hose control points, found offline by a route optimiser (minimum bend radius ≥ 2.5 × hose OD,
// clearance to every component, frame tube and other hose); see README.
const ROUTE = /*ROUTE*/{"potYaw": 1.5708, "pumpYaw": 3.1416, "ySplit": {"c": [-130.878766, 174.58054, -266.858585], "a": [-0.010703, 1.349884, 0.343832], "r": 1.189983}, "yMerge": {"c": [-153.185642, 433.703118, -718.497552], "a": [0.307544, -0.862982, -1.82065], "r": 1.414104}, "vias": {"h2": {"v": [[-111.332232, 279.178568, -223.802285], [-124.011683, 264.650858, -242.02268]], "la": 25.473415, "lb": 28.542159}, "h3m": {"v": [[-215.150051, 74.957086, -381.471561], [-146.816739, 248.510779, -473.931228]], "la": 48.160374, "lb": 28.463018}, "h4m": {"v": [[-128.727053, 336.611695, -492.678666], [-143.324777, 377.84167, -569.960239]], "la": 25.025602, "lb": 45.438588}, "h3i": {"v": [[104.839378, 89.196215, -544.838902]], "la": 110, "lb": 110}, "h4i": {"v": [[-180.143004, 356.338589, -498.270839], [-188.996662, 559.70182, -571.905319]], "la": 55.37384, "lb": 70.659459}, "h5": {"v": [], "la": 34.323775, "lb": 80.657766}, "h6": {"v": [[290.568375, 176.677295, -820.69311], [90.891515, 351.707776, -685.409025], [-211.470202, 646.329831, -368.531172]], "la": 30.379213, "lb": 29.270481}}}/*END*/;
function yBasis(o) { // trunk axis t (unit), legs at ±35° about −t in the plane of side vector s (roll r about t)
  const n0 = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); }, cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const t = n0(o.a), ref = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; let s = n0(cr(ref, t)); const u = cr(t, s);
  s = s.map((v, i) => v * Math.cos(o.r) + u[i] * Math.sin(o.r)); const n = cr(s, t);
  return { c: o.c, t, s, n };
}
const GEO = (() => {
  const g = {};
  // rear bay (approximate): firewall at z = 0, rear end of the frame at z = −780; x + is the car's right
  g.frame = { xb: 230, xt: 250, yb: 40, yt: 600, zr: -780, zrt: -720, zf: 0, r: 12.7 };
  g.firewall = { z: 0 };
  // radiator outside the chassis at the rear, centred; air flows rearward (−z) out through two 4 in fans
  g.rad = { c: [0, 170, -836], W: 11.75 * IN, H: 4.875 * IN, D: 3.8 * IN, coreW: 9.25 * IN, coreH: 4.5 * IN, coreD: 2.0 * IN };
  g.rad.tankW = (g.rad.W - g.rad.coreW) / 2;
  const rc = g.rad.c, rW = g.rad.W, rH = g.rad.H;
  g.radIn = [rc[0] - rW / 2 + g.rad.tankW / 2, rc[1] + rH / 2, rc[2]];
  g.radInEnd = [g.radIn[0], g.radIn[1] + 38, rc[2]];
  g.radOut = [rc[0] + rW / 2, rc[1] - rH / 2 + 22, rc[2]];
  g.radOutEnd = [g.radOut[0] + 38, g.radOut[1], rc[2]];
  g.shroudLen = 40;
  g.fans = { n: 2, D: 4 * IN, depth: 32, pitch: 4.4 * IN };
  g.fan = { D: g.fans.D, depth: g.fans.depth, holes: 82.5, c: [rc[0], rc[1], rc[2] - g.rad.coreD / 2 - g.shroudLen - g.fans.depth / 2] };
  // EMRAX 228 near the rear, axis across the car, stator side + coolant ports toward the left (−x)
  g.motor = { c: [10, 300, -540], D: 228, L: 86 };
  // DTI HV-500LC forward of the motor, standing across the car (420 wide, 213 tall, 77 thick); ports on its rear face, left end
  g.inv = { c: [0, 285, -330], L: 420, Wd: 213, Hh: 77 };
  // swirl pot V3 at the highest point, front left, on the cross tube just behind the firewall; pump directly under it
  const sp = g.pot = { ri: 1.25 * IN, ro: 2.625 / 2 * IN, body: 4.0 * IN, cone: 2.0 * IN, outRi: 0.625 / 2 * IN, nipRo: 0.75 / 2 * IN, nipL: 4.1 * IN, inletY: 3.4 * IN, capD: 2.75 * IN, capT: 0.125 * IN, open: 1.0 * IN, tubeRo: 0.75 / 2 * IN, wall: IN / 16 };
  sp.c = [-125, 0, -105];
  sp.base = 535;
  sp.nipBot = [sp.c[0], sp.base - sp.cone - sp.nipL, sp.c[2]];
  sp.inletZ = -(sp.ri - (sp.tubeRo - sp.wall));
  sp.yaw = ROUTE.potYaw || 0;
  { const c = Math.cos(sp.yaw), s = Math.sin(sp.yaw), lx = sp.ri + 62, lz = sp.inletZ; sp.inletEnd = [sp.c[0] + lx * c + lz * s, sp.base + sp.inletY, sp.c[2] - lx * s + lz * c]; sp.inletDir = [c, 0, -s]; }
  sp.top = sp.base + sp.body;
  g.pump = { c: [sp.c[0], sp.nipBot[1] - 32 - 78, sp.c[2]], yaw: ROUTE.pumpYaw };
  g.ySplit = yBasis(ROUTE.ySplit);
  g.yMerge = yBasis(ROUTE.yMerge);
  // catch bottle: rear right corner, low, inside the frame
  g.catchCan = { c: [165, 150, -690], D: 3.5 * IN, H: 7.0 * IN, wall: 0.065 * IN };
  // frame tubes
  const F = g.frame, T = [];
  for (const s of [-1, 1]) {
    T.push([[s * F.xb, F.yb, F.zr], [s * F.xb, F.yb, F.zf]], [[s * F.xt, F.yt, F.zrt], [s * F.xt, F.yt, F.zf]], [[s * F.xb, F.yb, F.zr], [s * F.xt, F.yt, F.zrt]],
      [[s * F.xb, F.yb, F.zf], [s * F.xt, F.yt, F.zf]], [[s * F.xb, F.yb, -390], [s * F.xt, F.yt, F.zf]], [[s * F.xb, F.yb, -390], [s * F.xt, F.yt, F.zrt]],
      [[s * F.xb, 300, F.zf], [s * F.xb, 300, -260]]);
  }
  T.push([[-F.xb, F.yb, F.zr], [F.xb, F.yb, F.zr]], [[-F.xt, F.yt, F.zrt], [F.xt, F.yt, F.zrt]], [[-F.xb, F.yb, -390], [F.xb, F.yb, -390]],
    [[-F.xb, F.yb, F.zf], [F.xb, F.yb, F.zf]], [[-F.xt, F.yt, F.zf], [F.xt, F.yt, F.zf]], [[-F.xt, F.yt, -22], [F.xt, F.yt, -22]],
    [[-236, 300, -753], [236, 300, -753]]);
  g.frameTubes = T;
  return g;
})();
// Clamped uniform cubic B-spline through a control polygon (C2-continuous: no kinks), resampled by arc length.
// End tangents follow the barb direction because the first/last control points sit on the barb axis.
function smoothRoute(ctrl, step = 4) {
  const C = [ctrl[0], ctrl[0], ...ctrl, ctrl[ctrl.length - 1], ctrl[ctrl.length - 1]], dense = [];
  for (let i = 0; i < C.length - 3; i++) {
    const [p0, p1, p2, p3] = [C[i], C[i + 1], C[i + 2], C[i + 3]];
    const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]), m = Math.max(6, Math.ceil(seg / 1.2));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const b0 = (1 - t) ** 3 / 6, b1 = (3 * t3 - 6 * t2 + 4) / 6, b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, b3 = t3 / 6;
      dense.push([0, 1, 2].map((j) => b0 * p0[j] + b1 * p1[j] + b2 * p2[j] + b3 * p3[j]));
    }
  }
  dense.push(ctrl[ctrl.length - 1]);
  const cum = [0]; for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1], dense[i][2] - dense[i - 1][2]));
  const Ltot = cum[cum.length - 1], N = Math.max(8, Math.ceil(Ltot / step)), out = [];
  let j = 0;
  for (let k = 0; k <= N; k++) { const s = Ltot * k / N; while (j < cum.length - 2 && cum[j + 1] < s) j++; const f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]); out.push(dense[j].map((v, q) => v + (dense[j + 1][q] - v) * f)); }
  return out;
}
// Relax any stretch tighter than rMin (keeps the first/last `pin` mm straight on the barbs)
function relaxBends(p, rMin = 45, pin = 14) {
  const d = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + d(p[i], p[i - 1]));
  const L = cum[cum.length - 1], lo = cum.findIndex((c) => c >= pin), hiIdx = cum.findIndex((c) => c >= L - pin);
  for (let it = 0; it < 4000; it++) {
    let worst = 1e9, moved = false;
    for (let i = 2; i < p.length - 2; i++) {
      const a = p[i - 2], b = p[i], c = p[i + 2], ab = d(a, b), bc = d(b, c), ac = d(a, c), s = (ab + bc + ac) / 2;
      const ar = Math.sqrt(Math.max(0, s * (s - ab) * (s - bc) * (s - ac))), r = ar > 1e-9 ? ab * bc * ac / (4 * ar) : 1e9;
      worst = Math.min(worst, r);
      if (r < rMin) { for (let k = -2; k <= 2; k++) { const j = i + k; if (j <= lo || j >= hiIdx) continue; for (let q = 0; q < 3; q++) p[j][q] += ((p[j - 1][q] + p[j + 1][q]) / 2 - p[j][q]) * 0.5; } moved = true; }
    }
    if (!moved) break;
  }
  return p;
}
function pathLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]); return L; }
function pathTurn(p) {
  let a = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const u = [p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]], v = [p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1], p[i + 1][2] - p[i][2]];
    const lu = Math.hypot(...u), lv = Math.hypot(...v); if (lu < 1e-6 || lv < 1e-6) continue;
    a += Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv))));
  }
  return a * 180 / Math.PI;
}
function minBendRadius(p) {
  let r = 1e9;
  for (let i = 2; i < p.length - 2; i++) {
    const a = p[i - 2], b = p[i], c = p[i + 2], ab = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), bc = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]), ac = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const s = (ab + bc + ac) / 2, area = Math.sqrt(Math.max(0, s * (s - ab) * (s - bc) * (s - ac)));
    if (area > 1e-6) r = Math.min(r, ab * bc * ac / (4 * area));
  }
  return r;
}
const catmull = (pts, step) => smoothRoute(pts, step || 4);
// Barb tips (hose ends) with outward barb directions
function ports() {
  const g = GEO, P = {}, D = {};
  const set = (k, p, d) => { P[k] = p; D[k] = d; };
  set('potOut', g.pot.nipBot, [0, -1, 0]);
  const pc = g.pump.c;
  set('pumpIn', [pc[0], pc[1] + 78, pc[2]], [0, 1, 0]);
  const cy = Math.cos(g.pump.yaw), sy = Math.sin(g.pump.yaw), rotY = (v) => [v[0] * cy + v[2] * sy, v[1], -v[0] * sy + v[2] * cy];
  const po = rotY([-20, 12, 75]); set('pumpOut', [pc[0] + po[0], pc[1] + po[1], pc[2] + po[2]], rotY([0, 0, 1]));
  const yPorts = (Y, trunk, legA, legB) => {
    const at = (dir, L) => [Y.c[0] + dir[0] * L, Y.c[1] + dir[1] * L, Y.c[2] + dir[2] * L];
    const la = Y.t.map((v, i) => -0.817 * v - 0.576 * Y.s[i]), lb = Y.t.map((v, i) => -0.817 * v + 0.576 * Y.s[i]);
    set(trunk, at(Y.t, 46), Y.t); set(legA, at(la, 53.8), la); set(legB, at(lb, 53.8), lb);
  };
  yPorts(g.ySplit, 'ySplitIn', 'ySplitM', 'ySplitI');
  yPorts(g.yMerge, 'yMergeOut', 'yMergeM', 'yMergeI');
  const m = g.motor;
  set('motorIn', [m.c[0] - m.L / 2 - 34, m.c[1] - 26, m.c[2] + 60], [-1, 0, 0]);
  set('motorOut', [m.c[0] - m.L / 2 - 34, m.c[1] + 26, m.c[2] + 60], [-1, 0, 0]);
  const v = g.inv;
  // HV-500LC coolant ports on the top edge near the rear end, pointing up
  // HV-500LC coolant ports on the rear face near its left end, pointing rearward
  set('invIn', [v.c[0] - v.L / 2 + 40, v.c[1] - 40, v.c[2] - v.Hh / 2 - 34], [0, 0, -1]);
  set('invOut', [v.c[0] - v.L / 2 + 40, v.c[1] + 40, v.c[2] - v.Hh / 2 - 34], [0, 0, -1]);
  set('radIn', g.radInEnd, [0, 1, 0]); set('radOut', g.radOutEnd, [1, 0, 0]);
  { const sp = g.pot; sp.yaw = ROUTE.potYaw || 0; const c = Math.cos(sp.yaw), s = Math.sin(sp.yaw), lx = sp.ri + 62, lz = sp.inletZ; sp.inletEnd = [sp.c[0] + lx * c + lz * s, sp.base + sp.inletY, sp.c[2] - lx * s + lz * c]; sp.inletDir = [c, 0, -s]; set('potIn', sp.inletEnd, sp.inletDir); }
  P._dir = D;
  return P;
}
function hoseRuns(route) {
  const RT = route || ROUTE, P = ports(), D = P._dir;
  const lead = (k, L) => [P[k][0] + D[k][0] * L, P[k][1] + D[k][1] * L, P[k][2] + D[k][2] * L];
  const mk = (id, a, b) => { const v = (RT.vias && RT.vias[id]) || { v: [], la: 40, lb: 40 }; return smoothRoute([P[a], lead(a, v.la * 0.5), lead(a, v.la), ...v.v, lead(b, v.lb), lead(b, v.lb * 0.5), P[b]], 4); };
  const runs = [
    { id: 'h1', name: 'Swirl pot → pump', line: 'pump', path: smoothRoute([P.potOut, P.pumpIn], 2) },
    { id: 'h2', name: 'Pump → Y split', line: 'pump', path: mk('h2', 'pumpOut', 'ySplitIn') },
    { id: 'h3m', name: 'Y split → motor', line: 'motor', path: mk('h3m', 'ySplitM', 'motorIn') },
    { id: 'h4m', name: 'Motor → Y merge', line: 'motor', path: mk('h4m', 'motorOut', 'yMergeM') },
    { id: 'h3i', name: 'Y split → inverter', line: 'inv', path: mk('h3i', 'ySplitI', 'invIn') },
    { id: 'h4i', name: 'Inverter → Y merge', line: 'inv', path: mk('h4i', 'invOut', 'yMergeI') },
    { id: 'h5', name: 'Y merge → radiator in', line: 'main', path: mk('h5', 'yMergeOut', 'radIn'), sensors: [{ type: 'temp', name: 'Radiator inlet temperature', at: 0.5 }] },
    { id: 'h6', name: 'Return: radiator out → swirl pot', line: 'return', path: mk('h6', 'radOut', 'potIn'), sensors: [{ type: 'temp', name: 'Radiator outlet temperature', at: 0.1 }, { type: 'flow', name: 'Flow sensor (before swirl pot inlet)', at: 0.86 }] }
  ];
  for (const r of runs) { r.sensors = r.sensors || []; r.L = pathLen(r.path); r.turn = pathTurn(r.path); r.minR = minBendRadius(r.path); }
  return runs;
}
if (typeof module !== 'undefined') module.exports = { ROUTE, yBasis, relaxBends, GEO, hoseRuns, ports, catmull, smoothRoute, pathLen, pathTurn, minBendRadius, IN };
