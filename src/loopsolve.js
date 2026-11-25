// Cooling-loop solver: pump curve, parallel branch split (equal dP), node-by-node energy balance closed through
// the Radiator Flow Lab engine (solveRadiator / operatingPoint, unchanged), lumped transient, rule/limit checks.
const LPM = 1 / 60000; // L/min -> m3/s
const G0 = 9.81;
// SPAL VA22-BP11/C-50S fan curve (m3/s, Pa), from the brief
const SPAL = [[0.046, 248], [0.050, 224], [0.057, 203], [0.073, 174], [0.089, 124], [0.109, 100], [0.123, 74], [0.133, 49], [0.141, 24], [0.148, 0]];
function spalDP(Q) {
  if (Q <= SPAL[0][0]) return SPAL[0][1];
  for (let i = 1; i < SPAL.length; i++) if (Q <= SPAL[i][0]) { const [a, b] = [SPAL[i - 1], SPAL[i]]; return a[1] + (b[1] - a[1]) * (Q - a[0]) / (b[0] - a[0]); }
  return 0;
}
// Davies Craig EBP40 24 V: shut-off 85 kPa, 10 kPa at 35.5 L/min, 0 at 37 L/min. Middle of curve interpolated
// as H = H0 - (H0 - 10)(Q/35.5)^2, linear from 35.5 to 37. Other voltages: affinity laws with speed ∝ voltage (assumed).
const PUMP = { H0: 85000, Q1: 35.5, H1: 10000, Qmax: 37 };
function pumpH24(qL) {
  if (qL <= 0) return PUMP.H0;
  if (qL <= PUMP.Q1) return PUMP.H0 - (PUMP.H0 - PUMP.H1) * (qL / PUMP.Q1) ** 2;
  if (qL <= PUMP.Qmax) return PUMP.H1 * (PUMP.Qmax - qL) / (PUMP.Qmax - PUMP.Q1);
  return 0;
}
function pumpH(qL, V) { const s = V / 24; return s * s * pumpH24(qL / s); }
// Water properties (plain water) from the Radiator Flow Lab engine
const water = (T) => coolantProps(T + 3, 'water'); // engine evaluates at TcIn-3; pass T+3 to evaluate exactly at T
// Darcy friction factor, Churchill (1977): laminar, transition and turbulent in one expression
function fDarcy(Re, rel) {
  if (Re < 1) Re = 1;
  const A = Math.pow(2.457 * Math.log(1 / (Math.pow(7 / Re, 0.9) + 0.27 * rel)), 16), B = Math.pow(37530 / Re, 16);
  return 8 * Math.pow(Math.pow(8 / Re, 12) + 1 / Math.pow(A + B, 1.5), 1 / 12);
}
const K = { bend90: 0.25, barb: 0.3, ySplitLeg: 1.0, yMergeLeg: 1.0, potIn: 1.0, potOut: 0.5, sensorT: 0.2, flowSensor: 1.5, radNipple: 0.3 };
function defaultInputs() {
  return {
    pumpV: 24, fan: true, fanOnT: 45, fanHyst: 3, speed: 50, TaIn: 32.2, alt: 300, Cp: 0.4,
    qMotor: 3.89, qInv: 0.813, qRotor: 1.67,
    idMain: 0.75, idMotor: 0.4375, idInv: 0.5625, idReturn: 0.75,
    orificeMM: 0, capBar: 0.9, volL: 6.9, metalKg: 4.2, minutes: 25, driverChange: true, lapAmp: 0.3, loadPct: 100
  };
}
const RADCORE = { W: 235, H: 114.3, D: 50.8, Fp: 25.4 / 20, Lp: 1.2, Fl: 8, df: 0.1, Th: 1.8, tw: 0.3, theta: 27 };
function radInputs(s, Tin, flowL, overrides) {
  return { ...RADCORE, alt: s.alt, TaIn: s.TaIn, TcIn: Tin, flow: Math.max(0.2, flowL), cool: 'water', mode: 'drive', speed: s.speed, Cp: s.Cp, fan: s.fan, fanCurve: spalDP, ...(overrides || {}) };
}
function faceVelocity(s, overrides) { return operatingPoint(radInputs(s, 60, 10, overrides)); }

// --------- hydraulics ---------
function buildNet(s, runs) {
  const D = (inch) => inch * 0.0254;
  const lineID = { pump: D(s.idMain), main: D(s.idMain), return: D(s.idReturn), motor: D(s.idMotor), inv: D(s.idInv) };
  const hoses = runs.map((r) => ({ id: r.id, name: r.name, line: r.line, L: r.L / 1000, D: lineID[r.line], Kb: K.bend90 * r.turn / 90, sensor: r.sensor }));
  return { hoses, orifice: s.orificeMM / 1000, Dinv: lineID.inv };
}
function hoseDP(h, Q, w, extraK) {
  const A = Math.PI * h.D * h.D / 4, V = Q / A, Re = w.rho * V * h.D / w.mu, f = fDarcy(Re, 1.5e-6 / h.D);
  const K_ = h.Kb + 2 * K.barb + (extraK || 0) + (h.sensor === 'flow' ? K.flowSensor : h.sensor ? K.sensorT : 0);
  const fr = f * h.L / h.D * w.rho * V * V / 2, mi = K_ * w.rho * V * V / 2;
  return { dp: fr + mi, fr, mi, V, Re, f, K: K_ };
}
const motorDP = (qL) => 50000 * (qL / 6) ** 2;      // EMRAX 228: 0.5 bar at 6 L/min, ∝ Q² (assumed)
const invDP = (qL) => 5000 * (qL / 11.67) ** 2;     // DTI HV-500LC: 0.05 bar at 11.67 L/min, ∝ Q² (needs datasheet check)
function branchDP(net, which, Q, w) {
  const hs = net.hoses.filter((h) => h.line === which);
  let dp = 0; const parts = [];
  for (const h of hs) { const isIn = h.id.startsWith('h3'); const r = hoseDP(h, Q, w, isIn ? K.ySplitLeg : K.yMergeLeg); dp += r.dp; parts.push({ name: h.name, ...r }); }
  const comp = which === 'motor' ? motorDP(Q / LPM) : invDP(Q / LPM);
  dp += comp; parts.push({ name: which === 'motor' ? 'EMRAX 228 stator jacket' : 'HV-500LC cold plate', dp: comp, comp: true });
  if (which === 'inv' && net.orifice > 0) { // sharp-edged restrictor in the inverter leg (optional), Cd = 0.62
    const d = Math.min(net.orifice, net.Dinv * 0.95), b = d / net.Dinv, Ao = Math.PI * d * d / 4;
    const dpo = (1 - b ** 4) / (0.62 * 0.62) * w.rho / 2 * (Q / Ao) ** 2; dp += dpo; parts.push({ name: 'Restrictor orifice ' + (d * 1000).toFixed(1) + ' mm', dp: dpo, comp: true });
  }
  return { dp, parts };
}
function splitFlow(net, Q, w) {
  let lo = 0, hi = Q;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; const g = branchDP(net, 'motor', m, w).dp - branchDP(net, 'inv', Q - m, w).dp; if (g > 0) hi = m; else lo = m; }
  const qm = (lo + hi) / 2, bm = branchDP(net, 'motor', qm, w), bi = branchDP(net, 'inv', Q - qm, w);
  return { qm, qi: Q - qm, dp: (bm.dp + bi.dp) / 2, bm, bi, mismatch: Math.abs(bm.dp - bi.dp) };
}
function seriesDP(net, Q, w, radDP) {
  const parts = [];
  for (const h of net.hoses.filter((x) => x.line === 'pump' || x.line === 'main' || x.line === 'return')) {
    const ek = h.id === 'h6' ? K.potIn : h.id === 'h1' ? K.potOut : h.id === 'h5' ? K.radNipple : 0;
    parts.push({ name: h.name, ...hoseDP(h, Q, w, ek) });
  }
  // swirl pot outlet nipple (5/8 in ID x 4.1 in) friction
  const dn = 0.625 * 0.0254, An = Math.PI * dn * dn / 4, Vn = Q / An, Ren = w.rho * Vn * dn / w.mu;
  parts.push({ name: 'Swirl pot outlet nipple', dp: fDarcy(Ren, 1e-4) * 0.104 / dn * w.rho * Vn * Vn / 2, V: Vn });
  parts.push({ name: 'Radiator core + tanks (Flow Lab engine)', dp: radDP(Q), comp: true });
  return { dp: parts.reduce((a, p) => a + p.dp, 0), parts };
}
function solveHydraulics(s, runs, Tmean, radDPfn) {
  const w = water(Tmean), net = buildNet(s, runs);
  const qmaxL = PUMP.Qmax * s.pumpV / 24;
  const sys = (QL) => { const Q = QL * LPM; const sp = splitFlow(net, Q, w); const se = seriesDP(net, Q, w, radDPfn); return { total: sp.dp + se.dp, sp, se }; };
  let lo = 0.05, hi = qmaxL * 0.999;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (pumpH(m, s.pumpV) > sys(m).total) lo = m; else hi = m; }
  const QL = (lo + hi) / 2, r = sys(QL);
  return { QL, H: pumpH(QL, s.pumpV), sysDP: r.total, split: r.sp, series: r.se, net, w, sysFn: (q) => sys(q).total, qmaxL };
}

// --------- full steady solve ---------
function solveLoop(s, runs) {
  const Vf = faceVelocity(s);
  const radAt = (Tin, flowL) => solveRadiator({ ...radInputs(s, Tin, flowL), Vface: Vf, VfaceSolved: Vf });
  let Tmean = s.TaIn + 15, hyd = null, th = null;
  for (let it = 0; it < 4; it++) {
    const radDPfn = (Q) => radAt(Tmean, Q / LPM).dPcool;
    hyd = solveHydraulics(s, runs, Tmean, radDPfn);
    th = thermal(s, hyd, radAt);
    if (!th.ok) break;
    const Tn = (th.T.potOut + th.T.radIn) / 2;
    if (Math.abs(Tn - Tmean) < 0.05) { Tmean = Tn; break; }
    Tmean = Tn;
  }
  const rad = th.rad;
  const res = { s, Vf, hyd, th, rad, runs };
  res.pressures = pressures(s, hyd, runs);
  // heat load that would put the motor inlet exactly at 50 °C (temperatures scale ~linearly with load at fixed flows)
  res.maxLoadKW = th.ok ? (th.balance.Qload / 1000) * (50 - s.TaIn) / Math.max(0.01, th.T.motorIn - s.TaIn) : 0;
  res.volGeomL = geomVolume(s, hyd.net);
  res.checks = checks(res);
  return res;
}
function thermal(s, hyd, radAt) {
  const w = water(50), cp = w.cp;
  const mdot = hyd.QL * LPM * w.rho, mm = hyd.split.qm * w.rho, mi = hyd.split.qi * w.rho;
  const Qm = s.qMotor * 1000 * s.loadPct / 100, Qi = s.qInv * 1000 * s.loadPct / 100, Qload = Qm + Qi;
  const march = (T0) => {
    const T = { potOut: T0, pumpOut: T0, ySplit: T0, motorIn: T0, invIn: T0 };
    T.motorOut = T0 + Qm / Math.max(1e-6, mm * cp); T.invOut = T0 + Qi / Math.max(1e-6, mi * cp);
    T.yMerge = (mm * T.motorOut + mi * T.invOut) / Math.max(1e-9, mm + mi);
    T.radIn = T.yMerge;
    const rad = radAt(T.radIn, hyd.QL);
    T.radOut = T.radIn - rad.Q / (mdot * cp);
    T.potIn = T.radOut;
    return { T, rad };
  };
  // fixed point: radiator outlet must return to the assumed swirl-pot temperature
  let lo = s.TaIn + 0.01, hi = s.TaIn + 160, ok = true;
  const g = (T0) => march(T0).T.radOut - T0;
  if (g(hi) > 0) ok = false;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
  const T0 = (lo + hi) / 2, M = march(T0);
  const balance = { Qload, Qrad: M.rad.Q, err: (M.rad.Q - Qload) / Qload };
  return { ok, T: M.T, rad: M.rad, mdot, mm, mi, Qm, Qi, cp, balance };
}
function pressures(s, hyd, runs) {
  // gauge pressure along the loop, worst case: swirl pot held at cap pressure; static head from layout heights (m)
  const w = hyd.w, rg = w.rho * G0 / 1000, pot = s.capBar * 1e5, hPot = (GEO.pot.base + GEO.pot.body * 0.5) / 1000;
  const P = ports(), y = (p) => p[1] / 1000;
  const se = hyd.series.parts, find = (n) => (se.find((p) => p.name.startsWith(n)) || { dp: 0 }).dp;
  const pumpIn = pot + w.rho * G0 * (hPot - y(P.pumpIn)) - find('Swirl pot →') - find('Swirl pot outlet');
  const pumpOut = pumpIn + hyd.H;
  const ySplit = pumpOut - find('Pump →') + w.rho * G0 * (y(P.pumpOut) - y(P.ySplitIn));
  const bm = hyd.split.bm.parts, bi = hyd.split.bi.parts;
  const motorIn = ySplit - bm[0].dp + w.rho * G0 * (y(P.ySplitM) - y(P.motorIn));
  const invIn = ySplit - bi[0].dp + w.rho * G0 * (y(P.ySplitI) - y(P.invIn));
  const yMerge = ySplit - hyd.split.dp + w.rho * G0 * (y(P.ySplitM) - y(P.yMergeM));
  const radIn = yMerge - find('Y merge') + w.rho * G0 * (y(P.yMergeOut) - y(P.radIn));
  const radOut = radIn - find('Radiator core') + w.rho * G0 * (y(P.radIn) - y(P.radOut));
  return { pot, pumpIn, pumpOut, ySplit, motorIn, invIn, yMerge, radIn, radOut };
}
function tsat(s) { const Pabs = s.capBar * 1e5 + pressureAt(s.alt); return 1 / (1 / 373.15 - 8.314 / 40650 * Math.log(Pabs / 101325)) - 273.15; }
function checks(R) {
  const s = R.s, T = R.th.T, h = R.hyd, out = [];
  const add = (ok, label, value, limit, margin, note) => out.push({ ok, label, value, limit, margin, note });
  const qmL = h.split.qm / LPM, qiL = h.split.qi / LPM;
  if (!R.th.ok) add(false, 'Steady state', 'none', 'radiator must reject the load', '', 'The radiator cannot reject this heat load below 190 °C: no steady state.');
  add(T.motorIn <= 50, 'Motor coolant inlet', T.motorIn, 50, 50 - T.motorIn, 'EMRAX 228 coolant inlet max 50 °C');
  add(T.invIn <= 60, 'Inverter coolant inlet', T.invIn, 60, 60 - T.invIn, 'HV-500LC coolant max 60 °C (continuous 50, goal 40)');
  const Ts = tsat(s), Tmax = Math.max(T.motorOut, T.invOut, T.radIn);
  add(Tmax < Ts, 'Hottest coolant vs boiling at cap pressure', Tmax, +Ts.toFixed(1), Ts - Tmax, 'Saturation temperature at cap rating + site air pressure (Clausius–Clapeyron)');
  add(T.invIn <= 50, 'Inverter coolant, continuous rating', T.invIn, 50, 50 - T.invIn, 'Continuous 50 °C');
  add(qmL >= 6 && qmL <= 11, 'Motor flow', qmL, '6–11', qmL < 6 ? qmL - 6 : 11 - qmL, 'EMRAX datasheet coolant flow 6–11 L/min');
  const pr = R.pressures;
  add(pr.invIn <= 2e5, 'Inverter inlet pressure', pr.invIn / 1e5, 2.0, 2.0 - pr.invIn / 1e5, 'HV-500LC max 2 bar; worst case with swirl pot at cap pressure');
  add(h.H <= 85000 * (s.pumpV / 24) ** 2 + 1, 'Pump differential head', h.H / 1e5, (0.85 * (s.pumpV / 24) ** 2), 0.85 * (s.pumpV / 24) ** 2 - h.H / 1e5, 'EBP40 max head 0.85 bar at 24 V');
  add(pr.pumpOut <= 2.5e5, 'Pump housing pressure', pr.pumpOut / 1e5, 2.5, 2.5 - pr.pumpOut / 1e5, 'Retailer listing: burst pressure 250 kPa');
  add(pr.pumpIn > 0.2e5 - 1e5, 'Pump inlet pressure (cavitation margin)', pr.pumpIn / 1e5, '> −0.8', pr.pumpIn / 1e5 + 0.8, 'Gauge; low inlet pressure risks cavitation when not pressurised');
  for (const x of [...h.series.parts, ...h.split.bm.parts, ...h.split.bi.parts]) if (x.V != null && !x.comp) add(x.V <= 3, 'Velocity: ' + x.name, x.V, 3, 3 - x.V, 'Hose velocity guideline ~3 m/s');
  add(h.QL >= 28, 'Total flow vs 28 L/min target', h.QL, 28, h.QL - 28, 'Your target; pump can only deliver what the system curve allows');
  add(qiL >= 11.67, 'Inverter flow vs 11.67 L/min target', qiL, 11.67, qiL - 11.67, 'Your target');
  const bal = R.th.balance;
  add(Math.abs(bal.err) < 0.005, 'Energy balance closes', bal.err * 100, '±0.5 %', 0.5 - Math.abs(bal.err * 100), 'Radiator heat out vs motor + inverter heat in');
  return out;
}

function geomVolume(s, net) {
  let v = 0; for (const h of net.hoses) v += Math.PI * h.D * h.D / 4 * h.L * 1000;
  const p = GEO.pot, potV = (Math.PI * p.ri ** 2 * p.body + Math.PI * p.cone / 3 * (p.ri ** 2 + p.ri * p.outRi + p.outRi ** 2) + Math.PI * p.outRi ** 2 * p.nipL) / 1e6;
  return { hoses: v, pot: potV, radiator: 1.0, motor: 0.1, inverter: 0.1, pump: 0.05, yFittings: 0.04, total: v + potV + 1.0 + 0.1 + 0.1 + 0.05 + 0.04 };
}
function potVolumeL() { const p = GEO.pot; return { body: Math.PI * p.ri ** 2 * p.body / 1e6, cone: Math.PI * p.cone / 3 * (p.ri ** 2 + p.ri * p.outRi + p.outRi ** 2) / 1e6 }; }
// --------- lumped transient ---------
function transient(s, R) {
  const w = water(50), C = s.volL * w.rho / 1000 * w.cp + s.metalKg * 900;
  const mdot = R.th.mdot, cp = R.th.cp, dTload = (Qm, Qi) => (Qm + Qi) / (mdot * cp);
  // radiator conductance per °C of inlet-to-ambient difference for each airflow case (linearised from the engine)
  const perK = (speed, fan) => {
    const o = { speed, fan }; const Vf = faceVelocity(s, o); const Tin = s.TaIn + 25;
    const r = solveRadiator({ ...radInputs(s, Tin, R.hyd.QL, o), Vface: Vf, quick: true }); return r.Q / 25;
  };
  const k = { dOn: perK(s.speed, true), dOff: perK(s.speed, false), sOn: perK(0, true), sOff: perK(0, false) };
  const total = s.minutes * 60, dt = 1, out = [];
  let T0 = s.TaIn, fan = false;
  const Qm0 = s.qMotor * 1000 * s.loadPct / 100, Qi0 = s.qInv * 1000 * s.loadPct / 100;
  const chg = s.driverChange ? [total / 2, total / 2 + 180] : null;
  for (let t = 0; t <= total + (chg ? 180 : 0); t += dt) {
    const stopped = chg && t >= chg[0] && t < chg[1];
    const lap = 1 + s.lapAmp * Math.sin(2 * Math.PI * t / 75);
    const Qm = stopped ? 0 : Qm0 * lap, Qi = stopped ? 0 : Qi0 * lap;
    const Tmix = T0 + dTload(Qm, Qi);
    if (!s.fan) fan = false; else if (Tmix > s.fanOnT) fan = true; else if (Tmix < s.fanOnT - s.fanHyst) fan = false;
    const kk = stopped ? (fan ? k.sOn : k.sOff) : (fan ? k.dOn : k.dOff);
    const Qr = kk * Math.max(0, Tmix - s.TaIn);
    if (t % 5 === 0) out.push({ t, motorIn: T0, invOut: T0 + Qi / (R.th.mi * cp), radIn: Tmix, motorOut: T0 + Qm / (R.th.mm * cp), fan, stopped, Qload: Qm + Qi, Qr });
    T0 += (Qm + Qi - Qr) / C * dt;
  }
  return { pts: out, C, k, chg };
}
if (typeof module !== 'undefined') module.exports = { tsat, solveLoop, transient, defaultInputs, pumpH, spalDP, PUMP, LPM, water, fDarcy, K };
