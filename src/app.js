{
const $ = (id) => document.getElementById(id);
const fx = (v, d = 1) => (!isFinite(v) ? '–' : (Math.abs(v) < 1e-9 ? 0 : v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEF = defaultInputs();
let S = { ...DEF };
try { const sv = JSON.parse(localStorage.getItem('cooling-loop.v1') || 'null'); if (sv) S = { ...DEF, ...sv }; } catch (e) {}
const save = () => { try { localStorage.setItem('cooling-loop.v1', JSON.stringify(S)); } catch (e) {} };
const frac = (v) => { const n = Math.round(v * 16); const g = (a, b) => b ? g(b, a % b) : a; const w = Math.floor(n / 16), r = n % 16; if (!r) return w + '"'; const k = g(r, 16); return (w ? w + ' ' : '') + (r / k) + '/' + (16 / k) + '"'; };

// ---------- controls ----------
const C = [
  { id: 'speed', g: 'drive', l: 'Vehicle speed', u: 'km/h', min: 0, max: 120, step: 1, d: 0, sub: 'Average speed; sets ram air through the radiator' },
  { id: 'TaIn', g: 'drive', l: 'Ambient air', u: '°C', min: 5, max: 45, step: 0.1, d: 1 },
  { id: 'alt', g: 'drive', type: 'select', l: 'Site', opts: [[300, 'Michigan endurance (about 300 m)'], [990, 'Lubbock, TX (990 m)'], [0, 'Sea level']] },
  { id: 'Cp', g: 'drive', l: 'Duct pressure recovery', u: '', min: 0.1, max: 0.9, step: 0.01, d: 2, sub: 'Share of the car’s dynamic pressure reaching the core (estimate)' },
  { id: 'fan', g: 'drive', type: 'toggle', l: 'Radiator fan (SPAL VA22) on' },
  { id: 'qMotor', g: 'heat', l: 'Motor heat to coolant (stator)', u: 'kW', min: 0, max: 8, step: 0.01, d: 2, sub: 'EMRAX 228 at 64 kW continuous, η 0.92: 5.56 kW loss, 3.89 kW to liquid, 1.67 kW rotor to air' },
  { id: 'qInv', g: 'heat', l: 'Inverter heat to coolant', u: 'kW', min: 0, max: 2.5, step: 0.001, d: 3, sub: 'HV-500LC, interpolated at 504 V / 180 A' },
  { id: 'loadPct', g: 'heat', l: 'Duty, % of those loads', u: '%', min: 10, max: 150, step: 1, d: 0 },
  { id: 'pumpV', g: 'pump', l: 'Pump voltage (EBP40 24 V)', u: 'V', min: 12, max: 28, step: 0.1, d: 1, sub: 'Speed assumed ∝ voltage; flow ∝ speed, head ∝ speed²' },
  { id: 'idMain', g: 'pump', type: 'in', l: 'Pump line ID (pot → pump → Y)', min: 0.375, max: 1, step: 0.0625 },
  { id: 'idMotor', g: 'pump', type: 'in', l: 'Motor branch hose ID', min: 0.25, max: 0.75, step: 0.0625 },
  { id: 'idInv', g: 'pump', type: 'in', l: 'Inverter branch hose ID', min: 0.25, max: 0.75, step: 0.0625 },
  { id: 'idReturn', g: 'pump', type: 'in', l: 'Radiator feed and return ID', min: 0.375, max: 1, step: 0.0625 },
  { id: 'orificeMM', g: 'pump', l: 'Inverter-leg restrictor Ø (0 = none)', u: 'mm', min: 0, max: 12, step: 0.1, d: 1, sub: 'Optional orifice to push more flow through the motor' },
  { id: 'capBar', g: 'pump', l: 'Radiator cap rating', u: 'bar', min: 0.3, max: 1.6, step: 0.05, d: 2, sub: 'Worst-case swirl pot pressure for the pressure checks (assumed)' },
  { id: 'minutes', g: 'trans', l: 'Endurance driving time', u: 'min', min: 2, max: 40, step: 1, d: 0 },
  { id: 'driverChange', g: 'trans', type: 'toggle', l: 'Driver change at halfway (3 min stopped)' },
  { id: 'fanOnT', g: 'trans', l: 'Fan switches on at radiator inlet', u: '°C', min: 25, max: 95, step: 0.5, d: 1 },
  { id: 'fanHyst', g: 'trans', l: 'Fan hysteresis', u: '°C', min: 1, max: 10, step: 0.5, d: 1 },
  { id: 'lapAmp', g: 'trans', l: 'Lap-to-lap load swing', u: '±%', min: 0, max: 60, step: 1, d: 0, scale: 100 },
  { id: 'volL', g: 'trans', l: 'Coolant volume', u: 'L', min: 1, max: 10, step: 0.1, d: 1, sub: 'Your estimate is 6.9 L; the geometry gives less (see Parts)' },
  { id: 'metalKg', g: 'trans', l: 'Loop metal in thermal contact', u: 'kg Al', min: 0, max: 10, step: 0.1, d: 1, sub: 'Estimate: radiator, swirl pot, Y fittings, part of the pump' }
];
const TABS = [['drive', 'Drive'], ['heat', 'Heat'], ['pump', 'Pump & hoses'], ['trans', 'Transient']];
let tab = 'drive';
const rows = {};
function makeRow(c) {
  const el = document.createElement('div'); el.def = c;
  if (c.type === 'toggle') {
    el.className = 'toggle'; const id = 'tg_' + c.id;
    el.innerHTML = `<label for="${id}">${c.l}</label><button class="sw" id="${id}" aria-label="${c.l}"></button>`;
    el.querySelector('button').addEventListener('click', () => { S[c.id] = !S[c.id]; changed(c.id); });
    el.sync = () => el.querySelector('button').setAttribute('aria-pressed', S[c.id] ? 'true' : 'false');
  } else if (c.type === 'select') {
    el.className = 'row'; const id = 'sel_' + c.id;
    el.innerHTML = `<label for="${id}">${c.l}</label><span></span><select id="${id}" style="grid-column:1/-1">${c.opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
    const s = el.querySelector('select'); s.addEventListener('change', () => { S[c.id] = +s.value; changed(c.id); });
    el.sync = () => { s.value = String(S[c.id]); };
  } else {
    el.className = 'row'; const id = 'n_' + c.id, sc = c.scale || 1, isIn = c.type === 'in';
    el.innerHTML = `<label for="${id}">${c.l}</label><div class="num"><input id="${id}" inputmode="decimal" autocomplete="off"><em>${isIn ? 'in' : c.u}</em></div><input type="range" aria-label="${c.l}" min="${c.min}" max="${c.max}" step="${c.step}"><div class="sub"></div>`;
    const num = el.querySelector('.num input'), rng = el.querySelector('input[type=range]'), sub = el.querySelector('.sub');
    rng.addEventListener('input', () => { S[c.id] = c.scale ? +rng.value / sc : +rng.value; changed(c.id); });
    if (c.scale) { rng.min = c.min; rng.max = c.max; }
    const commit = () => {
      let t = num.value.trim(), v;
      if (isIn && /\//.test(t)) { const m = t.match(/^(\d+)?\s*(\d+)\/(\d+)/); v = m ? (+(m[1] || 0) + (+m[2]) / (+m[3])) : NaN; } else v = parseFloat(t.replace(/,/g, ''));
      if (!isFinite(v)) { el.sync(); return; }
      v = Math.max(c.min, Math.min(c.max, v)); S[c.id] = c.scale ? v / sc : v; changed(c.id);
    };
    num.addEventListener('change', commit); num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); num.blur(); } });
    el.sync = () => {
      const v = c.scale ? S[c.id] * sc : S[c.id];
      rng.value = v; rng.style.setProperty('--p', ((v - c.min) / (c.max - c.min) * 100).toFixed(1) + '%');
      if (document.activeElement !== num) num.value = isIn ? frac(v).replace('"', '') : fx(v, c.d).replace(/,/g, '');
      sub.textContent = isIn ? `${fx(v * 25.4, 2)} mm` + (c.id === 'idMotor' ? ' · brief: 7/16"' : c.id === 'idInv' ? ' · brief: 9/16"' : ' · brief: 3/4"') : (c.sub || '');
      sub.hidden = !sub.textContent;
    };
  }
  (rows[c.id] = rows[c.id] || []).push(el); return el;
}
const ctlEls = C.map(makeRow);
function renderTabs() {
  $('tabs').innerHTML = TABS.map(([k, t]) => `<button role="tab" data-t="${k}" aria-pressed="${k === tab}">${t}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; renderTabs(); renderCtl(); }));
}
function renderCtl() { const box = $('ctl'); box.innerHTML = ''; ctlEls.forEach((el) => { if (el.def.g === tab) box.appendChild(el); }); syncAll(); }
function syncAll() { for (const id in rows) for (const el of rows[id]) el.sync(); }
const PRE = [
  ['Skidpad', { speed: 35, loadPct: 45, minutes: 2, driverChange: false, lapAmp: 0.1 }],
  ['Autocross', { speed: 48, loadPct: 70, minutes: 2, driverChange: false, lapAmp: 0.35 }],
  ['Endurance', { speed: 55, loadPct: 100, minutes: 25, driverChange: true, lapAmp: 0.3 }]
];
$('presets').innerHTML = PRE.map(([n], i) => `<button class="btn" data-p="${i}">${n}</button>`).join('') + '<button class="btn" id="reset">Reset</button>';
const BASE = { fan: true, TaIn: 32.2, alt: 300, Cp: 0.4, qMotor: 3.89, qInv: 0.813, pumpV: 24, fanOnT: 45, fanHyst: 3, orificeMM: 0, capBar: 0.9 };
$('presets').querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { Object.assign(S, BASE, PRE[+b.dataset.p][1]); changed('preset'); }));
$('reset').addEventListener('click', () => { S = { ...DEF }; changed('preset'); });

// ---------- solve ----------
const runs = hoseRuns();
let R = null, TR = null, csv = null;
function solveAll() { R = solveLoop(S, runs); TR = transient(S, R); }
const hoseT = () => { const T = R.th.T; return { h1: [T.potOut, T.potOut], h2: [T.pumpOut, T.pumpOut], h3m: [T.ySplit, T.ySplit], h4m: [T.motorOut, T.motorOut], h3i: [T.ySplit, T.ySplit], h4i: [T.invOut, T.invOut], h5: [T.yMerge, T.yMerge], h6: [T.radOut, T.radOut] }; };
const hoseV = () => { const h = R.hyd, o = {}; for (const p of [...h.series.parts, ...h.split.bm.parts, ...h.split.bi.parts]) { const r = runs.find((x) => x.name === p.name); if (r) o[r.id] = p.V; } return o; };
const lpm = (q) => q / LPM;

// ---------- 3D ----------
const R3 = new LoopRenderer($('gl'), $('labels')); window.__R3 = R3;
let geoKey = '';
if (!R3.ok) { $('noGL').hidden = false; $('labels').hidden = true; }
function update3D() {
  if (!R3.ok) return;
  const key = [S.idMain, S.idMotor, S.idInv, S.idReturn].join('|');
  if (key !== geoKey) {
    const dim = (inch) => ({ ID: inch * 25.4, OD: (inch + 0.25) * 25.4 });
    R3.build(runs, { pump: dim(S.idMain), main: dim(S.idReturn), return: dim(S.idReturn), motor: dim(S.idMotor), inv: dim(S.idInv) }, R.rad);
    geoKey = key;
  }
  const T = R.th.T;
  R3.setState({ Tlo: S.TaIn, Thi: Math.max(T.motorOut, S.TaIn + 10), hoseT: hoseT(), hoseV: hoseV(), rad: { ...R.rad, rows: R.rad.rows }, fanOn: S.fan, potT: T.potIn, radV: R.rad.Vi });
}
const segBtn = (a, b, on) => { $(a).setAttribute('aria-pressed', on); if (b) $(b).setAttribute('aria-pressed', !on); };
$('vStudio').onclick = () => { R3.thermal = 0; segBtn('vStudio', 'vThermal', true); };
$('vThermal').onclick = () => { R3.thermal = 1; segBtn('vThermal', 'vStudio', true); };
$('vCut').onclick = () => { R3.cut = !R3.cut; segBtn('vCut', null, R3.cut); };
$('vFlow').onclick = () => { R3.flow = !R3.flow; segBtn('vFlow', null, R3.flow); };
$('vSpin').onclick = () => { R3.autoSpin = !R3.autoSpin; segBtn('vSpin', null, R3.autoSpin); };
$('vEx').oninput = (e) => { R3.explode = +e.target.value; e.target.style.setProperty('--p', (+e.target.value * 100) + '%'); };
$('vEx').style.setProperty('--p', '0%');
R3.onSpin = (v) => segBtn('vSpin', null, v);
$('vFocus').onchange = (e) => { R3.focus(e.target.value); if (e.target.value !== 'loop' && R3.autoSpin) { R3.autoSpin = false; segBtn('vSpin', null, false); } };
R3.onFocus = (k) => { $('vFocus').value = k; };
$('infoX').onclick = () => { $('info').hidden = true; R3.sel = null; };

// ---------- part info ----------
function partInfo(part) {
  const T = R.th.T, h = R.hyd, pr = R.pressures, qm = lpm(h.split.qm), qi = lpm(h.split.qi), Q = h.QL;
  const sp = GEO.pot, IN = 25.4;
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  const hoseInfo = (id) => { const r = runs.find((x) => x.id === id), p = [...h.series.parts, ...h.split.bm.parts, ...h.split.bi.parts].find((x) => x.name === r.name), Tm = hoseT()[id][0];
    const idIn = r.line === 'motor' ? S.idMotor : r.line === 'inv' ? S.idInv : r.line === 'pump' ? S.idMain : S.idReturn;
    return { name: r.name + (r.sensors.length ? ' · ' + r.sensors.map((x) => x.name).join(', ') : ''), mat: 'Clear PVC tubing, plastic hose clamps (rule EV.7.7.1 per brief)', dims: `${frac(idIn)} ID × ${fx(r.L, 0)} mm routed`, mount: 'Barbed both ends, plastic clamps', live: [['Coolant', fx(Tm, 1) + ' °C'], ['Flow', fx(r.line === 'motor' ? qm : r.line === 'inv' ? qi : Q, 2) + ' L/min'], ['Velocity', fx(p.V, 2) + ' m/s'], ['Re', fx(p.Re, 0)], ['ΔP', fx(p.dp / 1000, 2) + ' kPa']] }; };
  const I = {
    pot: { name: 'Swirl pot V3 (header)', mat: 'Aluminium, 1/16" wall, TIG welded', dims: `${fx(2.5, 2)}" ID / ${fx(2.625, 3)}" OD × 4.0" body, 25° cone, 2.0" drop to 5/8" ID outlet; ${fx(R.potV.body + R.potV.cone, 3)} L inside`, mount: 'Highest point of the loop, front left; band clamp bolted to a 2 in tab (Tab_2in) on the top cross tube just behind the firewall', live: [['Inlet (return)', fx(T.potIn, 1) + ' °C'], ['Outlet', fx(T.potOut, 1) + ' °C'], ['Pressure (cap)', fx(S.capBar, 2) + ' bar g'], ['Inlet tube velocity', fx(hoseV().h6, 2) + ' m/s']] },
    pump: { name: 'Davies Craig EBP40 24 V (#9041)', mat: 'PPS/PA66 body, brushless magnetic-drive motor', dims: '≈145 mm tall, Ø74 mm motor can, outlet barb 75 mm off-axis (from Pump_V1.SLDPRT); 3/4" barbs, 570 g', mount: 'Directly under the swirl pot, inlet on the pot nipple via a 32 mm hose; bracket to a 1 in tab (Tab_1in) on the left side tube', live: [['Flow', fx(Q, 2) + ' L/min'], ['Head', fx(h.H / 1000, 1) + ' kPa'], ['Voltage', fx(S.pumpV, 1) + ' V'], ['Inlet pressure', fx(pr.pumpIn / 1e5, 2) + ' bar g'], ['Outlet pressure', fx(pr.pumpOut / 1e5, 2) + ' bar g']] },
    ysplit: { name: 'Y fitting, split', mat: 'Aluminium', dims: '2.98 × 3.54 × 1.5 in; 3/4" trunk, 9/16" inverter leg, 7/16" motor leg', mount: 'Hose-supported, cable-tied to frame', live: [['In', fx(Q, 2) + ' L/min'], ['To motor', fx(qm, 2) + ' L/min'], ['To inverter', fx(qi, 2) + ' L/min'], ['Pressure', fx(pr.ySplit / 1e5, 2) + ' bar g']] },
    ymerge: { name: 'Y fitting, merge', mat: 'Aluminium', dims: '2.98 × 3.54 × 1.5 in; legs 7/16" and 9/16" in, 3/4" out', mount: 'Hose-supported', live: [['Mixed temperature', fx(T.yMerge, 1) + ' °C'], ['Out', fx(Q, 2) + ' L/min'], ['Pressure', fx(pr.yMerge / 1e5, 2) + ' bar g']] },
    motor: { name: 'EMRAX 228 High Voltage, combined cooled', mat: 'Aluminium housing; stator liquid-cooled, rotor air-cooled', dims: 'Ø228 × 86 mm, 12.9–13.5 kg (datasheet v1.7); 10 mm ports', mount: 'Near the rear inside the chassis, axis across the car, sprocket right, coolant ports left; motor mount plates not modelled', live: [['Coolant in', fx(T.motorIn, 1) + ' °C (max 50)'], ['Coolant out', fx(T.motorOut, 1) + ' °C'], ['Flow', fx(qm, 2) + ' L/min (6–11)'], ['Jacket ΔP', fx(h.split.bm.parts.find((p) => p.comp).dp / 1e5, 3) + ' bar'], ['Heat to coolant', fx(R.th.Qm / 1000, 2) + ' kW'], ['Rotor heat to air', fx(S.qRotor * S.loadPct / 100, 2) + ' kW']] },
    inv: { name: 'DTI HV-500LC inverter', mat: 'Aluminium housing with integrated cold plate, 14 mm ports', dims: '77 × 213 × 420 mm, 6.7 kg (DTI technical description, beta); coolant ports drawn on the rear face, left end (position assumed)', mount: 'Forward of the motor, standing across the car; two 2 in tabs on the lower cross tube', live: [['Coolant in', fx(T.invIn, 1) + ' °C (max 60)'], ['Coolant out', fx(T.invOut, 1) + ' °C'], ['Flow', fx(qi, 2) + ' L/min'], ['Cold plate ΔP', fx(h.split.bi.parts.find((p) => p.comp && !p.name.startsWith('Restrictor')).dp / 1e5, 3) + ' bar (check datasheet)'], ['Inlet pressure', fx(pr.invIn / 1e5, 2) + ' bar g (max 2)']] },
    radiator: { name: 'Radiator, single pass, side tanks', mat: 'Aluminium core 20 FPI louvered fins, welded side tanks, no reservoir', dims: '11.75 × 4.875 × 3.8 in overall; core 9.25 × 4.5 × 2.0 in; ~1.0 L, ~3.0 kg', mount: 'Outside the chassis at the rear centre; tank brackets on rubber isolators, bolted to 2 in tabs on the rear lower cross tube', live: [['In', fx(T.radIn, 1) + ' °C'], ['Out', fx(T.radOut, 1) + ' °C'], ['Heat out', fx(R.rad.Q / 1000, 2) + ' kW'], ['Face velocity', fx(R.Vf, 2) + ' m/s'], ['Air ΔP', fx(R.rad.dPair, 0) + ' Pa'], ['Coolant ΔP', fx(R.rad.dPcool / 1000, 2) + ' kPa']] },
    shroud: { name: 'Fan shroud', mat: '3D printed ASA / ABS / Nylon / CF-Nylon', dims: 'Covers the 9.25 × 4.5 in core face, 40 mm deep (assumed), back plate with two 4 in fan openings', mount: 'Flanged to the radiator core; fans bolt to the back plate', live: [] },
    fan: { name: 'Two 4 in (100 mm) fans', mat: 'Plastic housings', dims: 'Model not chosen yet; drawn as generic 100 mm square-frame fans', mount: '4 screws each to the shroud plate, very rear of the car', live: [['State', S.fan ? 'On' : 'Off']] },
    can: { name: 'Coolant catch can', mat: 'Aluminium', dims: `Ø3.5 × 7 in (assumed size), ${fx(R.canL, 2)} L capacity; 0.3 kg`, mount: 'Rear right corner, low, inside the frame; band clamp to a 2 in tab on the right bottom rail', live: [['Overflow line from the cap', fx(R3.overflowLen || 0, 0) + ' mm'], ['Drain/vent line', fx(R3.drainLen || 0, 0) + ' mm'], ['Capacity needed', fx(Math.max(0.9, 0.1 * S.volL), 2) + ' L (10% or 0.9 L)'], ['Vent', 'Hose ≥ 3 mm ID to the chassis bottom']] },
    lines: { name: 'Bleed / overflow line and catch-can vent', mat: 'Clear tubing', dims: 'From the radiator cap neck nipple on top of the swirl pot (the highest point) across to the catch can; can vents down to the chassis bottom (≥ 3 mm ID, T.5.6.4)', mount: 'Clamped', live: [['Purpose', 'Air collected in the swirl pot and expansion overflow leave here']] },
    firewall: { name: 'Firewall', mat: 'Sheet (driver side)', dims: 'Every cooling part sits behind it', mount: 'Frame', live: [] },
    frame: { name: 'Rear frame bay (approximate)', mat: '1" OD steel tube', dims: 'Laid out from the car screenshots, not the frame CAD', mount: 'Tabs welded where parts mount', live: [] },
    mounts: { name: 'Frame tabs (Tab_1in, Tab_2in)', mat: 'Steel, TIG-welded to the frame tubes', dims: 'Tab 1in: 1.0 × 0.5 in, Ø0.25 in hole, 0.25 in thick. Tab 2in: 2.0 × 1.0 in, Ø0.5 in hole, 0.075 in thick (read from your SLDPRT files)', mount: 'Bolted, rubber isolators at the radiator', live: [] }
  };
  if (/^h\d/.test(part)) return hoseInfo(part);
  return I[part];
}
R3.onPick = (part) => {
  if (!part) { $('info').hidden = true; return; }
  const p = partInfo(part); if (!p) { $('info').hidden = true; return; }
  $('iName').textContent = p.name;
  $('iBody').innerHTML = `<dl><dt>Material</dt><dd>${esc(p.mat)}</dd><dt>Size</dt><dd>${esc(p.dims)}</dd><dt>Mounting</dt><dd>${esc(p.mount)}</dd>${p.live.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  $('info').hidden = false; $('info').dataset.part = part;
};

// ---------- charts ----------
function chart(svg, cfg) { svg._cfg = cfg; if (!svg._ro) { svg._ro = new ResizeObserver(() => drawChart(svg)); svg._ro.observe(svg); } drawChart(svg); }
function drawChart(svg) {
  const c = svg._cfg; if (!c) return; const W = svg.clientWidth, H = svg.clientHeight; if (!W || !H) return;
  const m = { l: 52, r: 18, t: 16, b: 40 };
  const all = c.series.flatMap((s) => s.pts);
  const x0 = c.x0 ?? Math.min(...all.map((p) => p[0])), x1 = c.x1 ?? Math.max(...all.map((p) => p[0]));
  let y0 = c.y0 ?? Math.min(0, ...all.map((p) => p[1])), y1 = c.y1 ?? Math.max(...all.map((p) => p[1]), ...(c.hlines || []).map((h) => h.y)) * 1.08;
  const nice = (v) => { const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
  const ys = nice((y1 - y0) / 5 || 1); y0 = Math.floor(y0 / ys) * ys; y1 = Math.ceil(y1 / ys) * ys;
  const xs = nice((x1 - x0) / (W < 460 ? 4 : 8) || 1);
  const X = (v) => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r), Y = (v) => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  let s = '';
  for (const b of c.bands || []) s += `<rect x="${X(cl(b.x0, x0, x1))}" y="${b.top ? H - m.b - 8 : m.t}" width="${Math.max(0, X(cl(b.x1, x0, x1)) - X(cl(b.x0, x0, x1)))}" height="${b.top ? 8 : H - m.t - m.b}" fill="${b.color}" opacity="${b.op ?? 0.12}"/>`;
  for (let v = y0; v <= y1 + 1e-9; v += ys) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#2b3748" stroke-opacity=".7"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${fx(v, ys < 1 ? 1 : 0)}</text>`;
  for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) s += `<text x="${X(v)}" y="${H - m.b + 18}" text-anchor="middle">${fx(v, xs < 1 ? 1 : 0)}</text>`;
  s += `<text x="${W - m.r}" y="${H - 4}" text-anchor="end">${c.xl}</text><text x="${m.l - 8}" y="${m.t - 4}" text-anchor="start" style="font-size:12px">${c.yl}</text>`;
  for (const h of c.hlines || []) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(h.y)}" y2="${Y(h.y)}" stroke="${h.color}" stroke-dasharray="5 5" stroke-width="1.3"/><text x="${m.l + 6}" y="${Y(h.y) - 6}" text-anchor="start" style="fill:${h.color}">${h.label}</text>`;
  for (const v of c.vlines || []) s += `<line x1="${X(v.x)}" x2="${X(v.x)}" y1="${m.t}" y2="${H - m.b}" stroke="${v.color}" stroke-dasharray="4 4"/><text x="${X(v.x) + 5}" y="${m.t + 14}" style="fill:${v.color}">${v.label}</text>`;
  for (const sr of c.series) {
    const pts = sr.pts.filter((p) => isFinite(p[1]) && p[0] >= x0 && p[0] <= x1);
    if (pts.length < 2) continue;
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(cl(p[1], y0, y1)).toFixed(1)).join('');
    s += `<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="${sr.w || 2.4}" stroke-linejoin="round"${sr.dash ? ` stroke-dasharray="${sr.dash}"` : ''}/>`;
    if (sr.name) { const p = pts[sr.at != null ? Math.min(pts.length - 1, Math.floor(pts.length * sr.at)) : pts.length - 1]; s += `<text x="${Math.min(W - m.r - 4, X(p[0]))}" y="${Y(cl(p[1], y0, y1)) + (sr.below ? 18 : -8)}" text-anchor="end" style="fill:${sr.color}">${sr.name}</text>`; }
  }
  for (const k of c.marks || []) s += `<circle cx="${X(k.x)}" cy="${Y(k.y)}" r="6.5" fill="${k.color}" stroke="#0b0e13" stroke-width="3"/>${k.label ? `<text x="${X(k.x) + 10}" y="${Y(k.y) + (k.dy || -10)}" style="fill:${k.color}">${k.label}</text>` : ''}`;
  svg.innerHTML = s;
}
function charts() {
  const h = R.hyd, Q = h.QL;
  const pts = (f, a, b, n = 60) => Array.from({ length: n + 1 }, (_, i) => { const x = a + (b - a) * i / n; return [x, f(x)]; });
  const qmax = Math.max(40, PUMP.Qmax * S.pumpV / 24 * 1.05);
  const pump = pts((q) => pumpH(q, S.pumpV) / 1000, 0, Math.min(qmax, PUMP.Qmax * S.pumpV / 24), 60);
  const sys = pts((q) => h.sysFn(q) / 1000, 0.2, qmax, 40);
  const ser = [{ pts: sys, color: '#3fa7d6', name: 'system', at: 0.85 }, { pts: pump, color: '#ef2b36', name: `pump at ${fx(S.pumpV, 1)} V`, at: 0.35 }];
  if (Math.abs(S.pumpV - 24) > 0.05) ser.unshift({ pts: pts((q) => pumpH(q, 24) / 1000, 0, 37, 50), color: '#5d6b7e', name: '24 V', dash: '4 4', w: 1.5, at: 0.2 });
  chart($('c1'), { series: ser, x0: 0, x1: qmax, y0: 0, y1: Math.max(90, pumpH(0, S.pumpV) / 1000 * 1.1), xl: 'total flow, L/min', yl: 'kPa', marks: [{ x: Q, y: h.H / 1000, color: '#ef2b36', label: `${fx(Q, 1)} L/min at ${fx(h.H / 1000, 1)} kPa`, dy: -12 }], vlines: [{ x: 28, color: '#93a1b3', label: 'target 28' }] });
  $('c1n').textContent = `The pump settles at ${fx(Q, 1)} L/min and ${fx(h.H / 1000, 1)} kPa. ${Q < 28 ? `That is ${fx(28 - Q, 1)} L/min short of your 28 L/min target: the system curve crosses the pump curve before 28.` : 'That meets your 28 L/min target.'} The upper part of the pump curve between shut-off and 35.5 L/min is interpolated.`;
  const net = h.net, w = h.w;
  const bm = pts((q) => branchDP(net, 'motor', q * LPM, w).dp / 1000, 0, 16, 50), bi = pts((q) => branchDP(net, 'inv', q * LPM, w).dp / 1000, 0, 32, 50);
  const dp = h.split.dp / 1000, qm = lpm(h.split.qm), qi = lpm(h.split.qi);
  chart($('c2'), { series: [{ pts: bm, color: '#f39a3b', name: 'motor leg', at: 0.6 }, { pts: bi, color: '#8ce0d1', name: 'inverter leg', at: 0.9 }], x0: 0, x1: 32, y0: 0, y1: Math.max(dp * 2.2, 40), xl: 'branch flow, L/min', yl: 'kPa', bands: [{ x0: 6, x1: 11, color: '#3ccf91', op: 0.1 }], hlines: [{ y: dp, color: '#e9eef4', label: `shared ΔP ${fx(dp, 1)} kPa` }], marks: [{ x: qm, y: dp, color: '#f39a3b', label: `motor ${fx(qm, 2)}`, dy: 22 }, { x: qi, y: dp, color: '#8ce0d1', label: `inverter ${fx(qi, 2)}`, dy: 22 }] });
  $('c2n').textContent = `Both legs drop ${fx(dp, 1)} kPa (mismatch ${fx(h.split.mismatch, 3)} Pa). The motor jacket (0.5 bar at 6 L/min) is far stiffer than the inverter plate, so the motor gets ${fx(qm, 2)} L/min and the inverter ${fx(qi, 2)}. Green band: EMRAX 6–11 L/min.`;
  // transient
  const P = TR.pts, mins = (t) => t / 60;
  const tser = [
    { pts: P.map((p) => [mins(p.t), p.motorOut]), color: '#f39a3b', name: 'motor out', w: 1.6, at: 0.95 },
    { pts: P.map((p) => [mins(p.t), p.radIn]), color: '#ef2b36', name: 'radiator in', at: 0.75 },
    { pts: P.map((p) => [mins(p.t), p.invOut]), color: '#8ce0d1', name: 'inverter out', w: 1.8, at: 0.55, below: true },
    { pts: P.map((p) => [mins(p.t), p.motorIn]), color: '#e9eef4', name: 'motor in', at: 0.35, below: true }
  ];
  const bands = [];
  let st = null; for (const p of P) { if (p.fan && st === null) st = p.t; if (!p.fan && st !== null) { bands.push({ x0: mins(st), x1: mins(p.t), color: '#3fa7d6', op: 0.7, top: true }); st = null; } }
  if (st !== null) bands.push({ x0: mins(st), x1: mins(P[P.length - 1].t), color: '#3fa7d6', op: 0.7, top: true });
  if (TR.chg) bands.push({ x0: mins(TR.chg[0]), x1: mins(TR.chg[1]), color: '#93a1b3', op: 0.1 });
  if (csv) { const c = [['motor', '#e9eef4'], ['inv', '#8ce0d1'], ['radIn', '#ef2b36']]; for (const [k, col] of c) if (csv[k]) tser.push({ pts: csv[k], color: col, dash: '3 4', w: 1.6, name: 'MoTeC ' + ({ motor: 'motor', inv: 'inverter', radIn: 'radiator in' })[k], at: 0.98, below: true }); }
  const tmax = Math.max(...P.map((p) => p.motorOut));
  chart($('c3'), { series: tser, x0: 0, x1: mins(P[P.length - 1].t), y0: Math.floor(S.TaIn / 10) * 10, y1: Math.min(Math.max(70, tmax + 5, tsat(S) + 8), 200), xl: 'minutes', yl: '°C', bands, hlines: [{ y: 50, color: '#ff6a6f', label: 'motor inlet limit 50' }, { y: 60, color: '#f3b13c', label: 'inverter coolant max 60' }, { y: tsat(S), color: '#c77dff', label: `boils ≈${fx(tsat(S), 0)} at cap` }] });
  const end = P[P.length - 1], cross50 = P.find((p) => p.motorIn > 50);
  $('c3n').innerHTML = `Lumped estimate, thermal mass ${fx(TR.C / 1000, 1)} kJ/°C. Motor inlet ends at <b>${fx(end.motorIn, 1)} °C</b> after ${fx(mins(end.t), 0)} min${cross50 ? `, crossing 50 °C at ${fx(mins(cross50.t), 1)} min` : ', never crossing 50 °C'}. Blue strip at the bottom: fan running. ${TR.chg ? 'Grey band: driver change, car stopped, pump and fan still on.' : ''}`;
}

// ---------- schematic ----------
function schematic() {
  const svg = $('schem'); svg._draw = () => {
    const W = svg.clientWidth, H = svg.clientHeight; if (!W || !H) return;
    const T = R.th.T, h = R.hyd, pr = R.pressures, qm = lpm(h.split.qm), qi = lpm(h.split.qi), narrow = W < 520;
    const cx = W * (narrow ? 0.44 : 0.42), xl = W * (narrow ? 0.2 : 0.2), xr = W * (narrow ? 0.68 : 0.64), xret = W * (narrow ? 0.93 : 0.9);
    const y = (f) => 24 + f * (H - 48);
    const tcol = (Tv) => { const t = Math.max(0, Math.min(1, (Tv - S.TaIn) / Math.max(1, T.motorOut - S.TaIn))); const st = ['#2994db', '#8ce0d1', '#fae073', '#f58c33', '#db2133']; const k = t * 4, i = Math.min(3, Math.floor(k)), f = k - i; const a = st[i], b = st[i + 1]; const m = (j) => Math.round(parseInt(a.slice(j, j + 2), 16) * (1 - f) + parseInt(b.slice(j, j + 2), 16) * f); return `rgb(${m(1)},${m(3)},${m(5)})`; };
    const box = (x, yy, w, hh, title, lines, Tv, warn) => `<g><rect x="${x - w / 2}" y="${yy - hh / 2}" width="${w}" height="${hh}" rx="10" fill="#0d1218" stroke="${warn ? '#ff6a6f' : '#33425a'}" stroke-width="${warn ? 2 : 1}"/><rect x="${x - w / 2}" y="${yy - hh / 2}" width="5" height="${hh}" rx="2" fill="${Tv != null ? tcol(Tv) : '#33425a'}"/><text x="${x - w / 2 + 14}" y="${yy - hh / 2 + 20}" style="fill:#e9eef4;font-weight:600">${title}</text>${lines.map((l, i) => `<text x="${x - w / 2 + 14}" y="${yy - hh / 2 + 39 + i * 17}">${l}</text>`).join('')}</g>`;
    const pipe = (pts, Tv, wd, dash) => `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join('')}" fill="none" stroke="${Tv != null ? tcol(Tv) : '#93a1b3'}" stroke-width="${wd}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    const lab = (x, yy, t, anchor = 'start') => `<text x="${x}" y="${yy}" text-anchor="${anchor}" style="fill:#c3cdd9">${t}</text>`;
    const bw = narrow ? Math.min(150, W * 0.4) : Math.min(210, W * 0.34), bh = 64;
    const Y = { pot: y(0.06), pump: y(0.2), ys: y(0.33), comp: y(0.5), ym: y(0.66), rad: y(0.8), fan: y(0.94) };
    let s = '';
    const wMain = 6, wM = 3.5, wI = 5;
    s += pipe([[cx, Y.pot], [cx, Y.pump]], T.potOut, wMain) + pipe([[cx, Y.pump], [cx, Y.ys]], T.pumpOut, wMain);
    s += pipe([[cx, Y.ys], [xl, Y.ys + 30], [xl, Y.comp]], T.ySplit, wM) + pipe([[cx, Y.ys], [xr, Y.ys + 30], [xr, Y.comp]], T.ySplit, wI);
    s += pipe([[xl, Y.comp], [xl, Y.ym - 30], [cx, Y.ym]], T.motorOut, wM) + pipe([[xr, Y.comp], [xr, Y.ym - 30], [cx, Y.ym]], T.invOut, wI);
    s += pipe([[cx, Y.ym], [cx, Y.rad]], T.yMerge, wMain);
    s += pipe([[cx + bw / 2, Y.rad + 14], [xret, Y.rad + 14], [xret, Y.pot - 10], [cx + bw / 2, Y.pot - 10]], T.radOut, wMain);
    s += pipe([[cx - bw / 2, Y.pot - 14], [cx - bw / 2 - 60, Y.pot - 14]], null, 2, '4 5') + `<text x="${cx - bw / 2 - 66}" y="${Y.pot - 10}" text-anchor="end">bleed → catch can</text>`;
    s += box(cx, Y.pot, bw, bh, 'Swirl pot (highest)', [`${fx(T.potIn, 1)} °C · cap ${fx(S.capBar, 2)} bar → catch can`], T.potIn);
    s += box(cx, Y.pump, bw, bh, 'Pump EBP40', [`${fx(h.QL, 1)} L/min · +${fx(h.H / 1000, 1)} kPa`], T.pumpOut);
    s += box(cx, Y.ys, bw * 0.7, 46, 'Y split', [], T.ySplit);
    s += box(xl, Y.comp, bw, bh + 18, 'Motor EMRAX 228', [`${fx(T.motorIn, 1)} → ${fx(T.motorOut, 1)} °C`, `${fx(qm, 2)} L/min`], T.motorOut, T.motorIn > 50 || qm < 6 || qm > 11);
    s += box(xr, Y.comp, bw, bh + 18, 'Inverter HV-500LC', [`${fx(T.invIn, 1)} → ${fx(T.invOut, 1)} °C`, `${fx(qi, 2)} L/min`], T.invOut, T.invIn > 60 || pr.invIn > 2e5);
    s += box(cx, Y.ym, bw * 0.7, 46, 'Y merge', [], T.yMerge);
    s += box(cx, Y.rad, bw, bh, 'Radiator', [`${fx(T.radIn, 1)} → ${fx(T.radOut, 1)} °C · ${fx(R.rad.Q / 1000, 2)} kW`], T.radIn);
    s += box(cx, Y.fan, bw, 46, 'Fan + shroud (lowest)', [], null).replace('</text></g>', ` · ${S.fan ? 'on' : 'off'}</text></g>`);
    s += lab(xret - 6, (Y.rad + Y.pot) / 2, `return ${fx(h.QL, 1)} L/min`, 'end');
    s += lab(xl - 6, Y.ys + 60, frac(S.idMotor), 'end') + lab(xr + 8, Y.ys + 60, frac(S.idInv), 'start');
    svg.innerHTML = s;
  };
  if (!svg._ro) { svg._ro = new ResizeObserver(() => svg._draw()); svg._ro.observe(svg); }
  svg._draw();
}

// ---------- tables & flags ----------
function tables() {
  const T = R.th.T, pr = R.pressures, h = R.hyd;
  const nodes = [['Swirl pot outlet', T.potOut, pr.pot], ['Pump outlet', T.pumpOut, pr.pumpOut], ['Y split', T.ySplit, pr.ySplit], ['Motor inlet', T.motorIn, pr.motorIn], ['Motor outlet', T.motorOut, null], ['Inverter inlet', T.invIn, pr.invIn], ['Inverter outlet', T.invOut, null], ['Y merge (mixed)', T.yMerge, pr.yMerge], ['Radiator inlet', T.radIn, pr.radIn], ['Radiator outlet', T.radOut, pr.radOut], ['Swirl pot inlet (return)', T.potIn, null]];
  $('nodeT').innerHTML = `<thead><tr><th>Node</th><th class="n">°C</th><th class="n">bar g</th></tr></thead><tbody>${nodes.map(([n, t, p]) => `<tr><td>${n}</td><td class="n">${fx(t, 1)}</td><td class="n">${p == null ? '' : fx(p / 1e5, 2)}</td></tr>`).join('')}</tbody>`;
  const b = R.th.balance;
  $('balNote').textContent = `Energy balance: ${fx(b.Qload / 1000, 3)} kW in (motor ${fx(R.th.Qm / 1000, 2)} + inverter ${fx(R.th.Qi / 1000, 3)}), ${fx(b.Qrad / 1000, 3)} kW out of the radiator, error ${fx(b.err * 100, 3)} %. Pressures assume the swirl pot is at the ${fx(S.capBar, 2)} bar cap rating (worst case, hot).`;
  const r = R.rad;
  const rr = [['Face velocity (fan curve + ram)', fx(R.Vf, 2) + ' m/s'], ['Air mass flow', fx(r.mA * 1000, 1) + ' g/s'], ['Re<sub>Lp</sub> / j / f', `${fx(r.ReLp, 0)} / ${fx(r.j, 4)} / ${fx(r.f, 3)}`], ['Air-side h, fin efficiency', `${fx(r.hA, 0)} W/m²K, ${fx(r.etaF, 3)}`], ['Coolant Re, h', `${fx(r.Rei, 0)}, ${fx(r.hi, 0)} W/m²K`], ['UA / NTU / ε', `${fx(r.UA, 1)} W/K / ${fx(r.NTU, 2)} / ${fx(r.eps, 3)}`], ['Air ΔP / coolant ΔP', `${fx(r.dPair, 0)} Pa / ${fx(r.dPcool / 1000, 2)} kPa`], ['Heat per °C (inlet − ambient)', fx(r.Q / Math.max(0.1, T.radIn - S.TaIn), 1) + ' W/°C']];
  $('radT').innerHTML = `<tbody>${rr.map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`).join('')}</tbody>`;
  const all = [...h.series.parts.map((p) => ['Series', p]), ...h.split.bm.parts.map((p) => ['Motor leg', p]), ...h.split.bi.parts.map((p) => ['Inverter leg', p])];
  $('dpT').innerHTML = `<thead><tr><th>Path</th><th>Element</th><th class="n">V, m/s</th><th class="n">Re</th><th class="n">K</th><th class="n">ΔP, kPa</th></tr></thead><tbody>${all.map(([g, p]) => `<tr><td>${g}</td><td>${esc(p.name)}${p.comp ? (p.name.startsWith('HV') ? '<span class="est">datasheet check</span>' : p.name.startsWith('EMRAX') ? '<span class="est">∝ Q² assumed</span>' : '') : ''}</td><td class="n">${p.V != null ? fx(p.V, 2) : ''}</td><td class="n">${p.Re != null ? fx(p.Re, 0) : ''}</td><td class="n">${p.K != null ? fx(p.K, 2) : ''}</td><td class="n">${fx(p.dp / 1000, 2)}</td></tr>`).join('')}<tr><td></td><td><b>Pump head = series + branch</b></td><td></td><td></td><td></td><td class="n"><b>${fx(h.H / 1000, 2)} = ${fx(h.series.dp / 1000, 2)} + ${fx(h.split.dp / 1000, 2)}</b></td></tr></tbody>`;
  // parts & volume
  const water = S.volL * 0.99;
  const P = [['Radiator (core 9.25 × 4.5 × 2.0 in, 20 FPI)', 3.0], ['Two 4 in fans (brief weight for the SPAL, placeholder)', 1.3], ['Pump Davies Craig EBP40 24 V', 0.57], ['Swirl pot V3', 0.3], ['Catch can', 0.3], ['Hoses, clamps, Y fittings, sensors', 0.5], ['Coolant (water, at your volume)', water]];
  const tot = P.reduce((a, p) => a + p[1], 0);
  $('partsT').innerHTML = `<thead><tr><th>Part</th><th class="n">kg</th></tr></thead><tbody>${P.map(([n, m]) => `<tr><td>${n}</td><td class="n">${fx(m, 2)}</td></tr>`).join('')}<tr><td><b>Cooling system, wet</b></td><td class="n"><b>${fx(tot, 2)}</b></td></tr><tr><td style="color:var(--mute)">Not counted: EMRAX 228 (12.9–13.5 kg), HV-500 (6.7 kg), 3D-printed shroud, frame tabs</td><td></td></tr></tbody>`;
  const v = R.volGeomL;
  const V = [['Hoses (from routed lengths and IDs)', v.hoses], ['Swirl pot incl. outlet nipple bore', v.pot], ['Radiator', v.radiator], ['Motor jacket', v.motor], ['Inverter cold plate', v.inverter], ['Pump (estimate)', v.pump], ['Y fittings (estimate)', v.yFittings]];
  $('volT').innerHTML = `<tbody>${V.map(([n, x]) => `<tr><td>${n}</td><td class="n">${fx(x, 3)} L</td></tr>`).join('')}<tr><td><b>Geometry total</b></td><td class="n"><b>${fx(v.total, 2)} L</b></td></tr><tr><td>Your estimate (used in the transient)</td><td class="n">${fx(S.volL, 1)} L</td></tr><tr><td>Catch can capacity (Ø3.5 × 7 in, assumed)</td><td class="n">${fx(R.canL, 2)} L</td></tr><tr><td>Catch can required (10% of fluid or 0.9 L)</td><td class="n">${fx(Math.max(0.9, 0.1 * S.volL), 2)} L</td></tr></tbody>`;
  const sp = GEO.pot;
  $('potT').innerHTML = `<tbody><tr><td>Straight body: π · (1.25 in)² · 4.0 in</td><td class="n">${fx(R.potV.body, 3)} L</td></tr><tr><td>Cone frustum: π·h/3·(R² + Rr + r²), h 2.0 in, R 1.25 in, r 0.3125 in</td><td class="n">${fx(R.potV.cone, 3)} L</td></tr><tr><td><b>Swirl pot internal volume</b></td><td class="n"><b>${fx(R.potV.body + R.potV.cone, 3)} L</b></td></tr><tr><td>Cone half-angle from the dimensions</td><td class="n">${fx(Math.atan((sp.ri - sp.outRi) / sp.cone) * 180 / Math.PI, 1)}°</td></tr></tbody>`;
}
function flags() {
  const fmt = (c) => typeof c.value === 'number' ? fx(c.value, Math.abs(c.value) < 10 ? 2 : 1) : c.value;
  const unit = (l) => /temp|inlet$|coolant/i.test(l) && !/pressure/i.test(l) ? ' °C' : /flow|target/i.test(l) ? ' L/min' : /pressure|head/i.test(l) ? ' bar' : /Velocity/.test(l) ? ' m/s' : /balance/.test(l) ? ' %' : '';
  const out = R.checks.map((c) => `<div class="flag ${c.ok ? 'ok' : ''}"><span><b>${c.ok ? 'OK' : 'Over limit'}:</b> ${esc(c.label)} — ${fmt(c)}${unit(c.label)} vs ${esc(String(c.limit))}${unit(c.label)}</span><span class="m">margin ${typeof c.margin === 'number' ? fx(c.margin, 2) : c.margin}</span><small>${esc(c.note)}</small></div>`);
  const info = [
    ['Catch can rule', `FSAE rule T.5.6.1 (2021 edition) requires a cooling-system catch can of at least 10% of the fluid or 0.9 L, whichever is greater: ${fx(Math.max(0.9, 0.1 * S.volL), 2)} L here. The modelled can holds ${fx(R.canL, 2)} L (size assumed). T.5.6.2 lists 0.5 L for vents on other systems including an electric motor. Confirm against the 2026 rulebook.`],
    ['Inverter ΔP needs a datasheet check', 'HV-500LC pressure drop uses 0.05 bar at 11.67 L/min scaled with flow², from the brief.'],
    ['Motor ΔP scaling assumed', 'EMRAX 228 jacket uses 0.5 bar at 6 L/min scaled with flow²; real jackets often scale between Q^1.75 and Q².'],
    ['Pump voltage range', 'The brief lists 12–28 V; one retailer listing gives 20–27 V operating and 250 kPa burst pressure. Curves away from 24 V use affinity laws and are estimates.'],
    ['Pump curve interpolated', 'Only shut-off (0.85 bar), 35.5 L/min at 10 kPa and 37 L/min free flow are given; the curve between is a quadratic fit through those points.'],
    ['Coolant volume', `Geometry gives ${fx(R.volGeomL.total, 2)} L vs your 6.9 L estimate. The transient uses ${fx(S.volL, 1)} L; a smaller volume heats faster.`],
    ['Radiator tank depth assumed', 'Side tanks are modelled 3.8 in deep to match the 11.75 × 4.875 × 3.8 in overall size; nipples: inlet up from the left tank top, outlet out of the right tank bottom.'],
    ['Coolant', 'Plain water, no additives (FSAE 2026 rule per brief).']
  ];
  const bad = R.checks.filter((c) => !c.ok).length;
  $('chkH').textContent = bad ? `${bad} check${bad > 1 ? 's' : ''} over limit at these settings` : 'Every limit check passes at these settings';
  $('flags').innerHTML = [...out.filter((x) => !x.includes('flag ok')), ...info.map(([a, b]) => `<div class="flag cfm"><span><b>Confirm:</b> ${esc(a)}</span><span></span><small>${esc(b)}</small></div>`), ...out.filter((x) => x.includes('flag ok'))].join('');
}
function headline() {
  const T = R.th.T, h = R.hyd, qm = lpm(h.split.qm), load = R.th.balance.Qload / 1000;
  $('bT').innerHTML = `${fx(T.motorIn, 1)}<small>°C</small>`;
  const over = T.motorIn - 50;
  $('stat').innerHTML = R.th.ok ? (over > 0 ? `<b class="bad">${fx(over, 1)} °C over</b> the EMRAX 50 °C inlet limit` : `<b class="good">${fx(-over, 1)} °C under</b> the 50 °C inlet limit`) + ` · radiator carries about <b>${fx(R.maxLoadKW, 2)} kW</b> at a 50 °C motor inlet` : '<b class="bad">No steady state</b>: the radiator cannot reject this load';
  $('fQ').textContent = fx(h.QL, 1) + ' L/min'; $('fH').textContent = fx(h.H / 1000, 1) + ' kPa'; $('fQm').textContent = fx(qm, 2) + ' L/min'; $('fQi').textContent = fx(lpm(h.split.qi), 2) + ' L/min';
  $('fR').textContent = fx(R.rad.Q / 1000, 2) + ' kW'; $('fV').textContent = fx(R.Vf, 2) + ' m/s';
  $('fQm').className = qm < 6 || qm > 11 ? 'bad' : '';
  $('sM').textContent = fx(T.motorIn, 1) + ' °C'; $('sQ').textContent = fx(h.QL, 1) + ' L/min';
  $('title').textContent = !R.th.ok ? `At ${fx(load, 2)} kW the radiator cannot reach a steady state`
    : over > 0 ? `At ${fx(load, 2)} kW the motor coolant settles at ${fx(T.motorIn, 0)} °C, ${fx(over, 0)} °C over its 50 °C limit`
    : `At ${fx(load, 2)} kW the loop holds the motor inlet at ${fx(T.motorIn, 0)} °C, ${fx(-over, 0)} °C under the limit`;
  const pct = R.maxLoadKW / load * 100;
  $('lede').innerHTML = `This radiator rejects about <b>${fx(R.maxLoadKW, 2)} kW</b> with the motor inlet at 50 °C (${fx(pct, 0)}% of the load) at ${fx(S.speed, 0)} km/h, ${fx(S.TaIn, 1)} °C ambient, fan ${S.fan ? 'on' : 'off'}, face velocity ${fx(R.Vf, 2)} m/s. `
    + `The pump delivers <b>${fx(h.QL, 1)} L/min</b> (target 28); the motor leg gets <b>${fx(qm, 2)} L/min</b>${qm < 6 ? ', below the EMRAX 6 L/min minimum, because its jacket is much stiffer than the inverter leg' : ''}. Click any part in the 3D view for its live numbers.`;
  $('loopH').textContent = `Motor ${fx(T.motorIn, 1)} → ${fx(T.motorOut, 1)} °C, radiator ${fx(T.radIn, 1)} → ${fx(T.radOut, 1)} °C`;
  $('hydH').textContent = `Pump runs at ${fx(h.QL, 1)} L/min and ${fx(h.H / 1000, 1)} kPa`;
  const end = TR.pts[TR.pts.length - 1];
  $('trH').textContent = `After ${fx(end.t / 60, 0)} min the motor inlet reaches ${fx(end.motorIn, 0)} °C`;
  $('cLo').textContent = fx(S.TaIn, 0) + ' °C'; $('cHi').textContent = fx(Math.max(T.motorOut, S.TaIn + 10), 0) + ' °C';
  const L = { lb1: T.potIn, lb2: T.motorIn, lb3: T.invOut, lb4: T.radIn, lb5: T.radOut };
  for (const k in L) $(k).textContent = fx(L[k], 1) + ' °C';
  $('lb6').textContent = S.fan ? 'on, lowest point' : 'off, lowest point';
}
function method() {
  $('methodBody').innerHTML = `
<div>
 <h3>1 · Hydraulic operating point</h3>
 <p>Each hose: Darcy–Weisbach with the Churchill (1977) friction factor, which covers laminar, transitional and turbulent flow. Hose lengths are the routed centre-lines in the 3D model (${fx(runs.reduce((a, r) => a + r.L, 0) / 1000, 2)} m in total, against your ~2.5 m).</p>
 <div class="eq">ΔP = (f·L/D + ΣK)·ρV²/2 &nbsp; f = 8[(8/Re)¹² + (A+B)<sup>−1.5</sup>]<sup>1/12</sup></div>
 <p>Minor losses <span class="est">estimates</span>: 0.25 per 90° of measured bend, 0.3 per barb, 1.0 per Y leg, 1.0 swirl-pot tangential inlet (jet dumps), 0.5 swirl-pot outlet, 0.3 per radiator nipple, 0.2 per inline temperature sensor, 1.5 for the flow sensor.</p>
 <p>Components: EMRAX 228 jacket 0.5 bar at 6 L/min ∝ Q² <span class="est">assumed</span>; HV-500LC 0.05 bar at 11.67 L/min ∝ Q² <span class="est">datasheet check</span>; radiator core + tanks from the Radiator Flow Lab engine (flat-tube laminar/Gnielinski with tank contraction and expansion).</p>
 <p>Parallel legs: bisection on the motor-leg flow until ΔP<sub>motor leg</sub> = ΔP<sub>inverter leg</sub>. Operating point: bisection on total flow until pump head = series ΔP + shared branch ΔP. Elevation cancels around a closed loop; it only enters the node pressures.</p>
 <div class="eq">EBP40 at 24 V: H = 85 − 75·(Q/35.5)² kPa for Q ≤ 35.5, then linear to 0 at 37 L/min</div>
 <div class="eq">Other voltages (affinity, n ∝ V): H<sub>V</sub>(Q) = s²·H<sub>24</sub>(Q/s), s = V/24</div>
 <h3 style="margin-top:16px">2 · Thermal loop</h3>
 <p>Starting from a guessed swirl-pot temperature, march node by node: ΔT = Q/(ṁc<sub>p</sub>) through the motor and inverter at their own flows, mix at the Y merge by ṁ-weighting, then hand the mixed temperature and total flow to the radiator engine. Bisection on the swirl-pot temperature until the radiator outlet returns to it, so heat out equals heat in. Hydraulics are re-solved at the new mean water temperature until both settle.</p>
 <p>Radiator engine, unchanged from Radiator Flow Lab: Chang &amp; Wang (1997) louver-fin j, Kim &amp; Bullard (2002) friction with entrance/exit losses, straight-fin efficiency, ε-NTU for crossflow with both fluids unmixed, air density from site altitude. Face velocity solves core ΔP = C<sub>p</sub>·½ρv² + fan pressure, with the SPAL curve points interpolated (the only change: the engine accepts a tabulated fan curve).</p>
 <div class="eq">ε = 1 − exp[(1/C<sub>r</sub>)·NTU<sup>0.22</sup>(e<sup>−C<sub>r</sub>NTU<sup>0.78</sup></sup> − 1)]</div>
</div>
<div>
 <h3>3 · Checks</h3>
 <p>Motor coolant inlet ≤ 50 °C; inverter coolant ≤ 60 °C (continuous 50); motor flow 6–11 L/min; inverter inlet ≤ 2 bar and pump head ≤ 0.85 bar; hose velocity ≤ ~3 m/s; total flow vs your 28 L/min target and inverter flow vs 11.67 L/min. Pressures are gauge, with the swirl pot at the cap rating plus static head from the 3D layout heights.</p>
 <h3 style="margin-top:16px">4 · Transient <span class="est">lumped estimate</span></h3>
 <div class="eq">(m<sub>w</sub>c<sub>w</sub> + m<sub>Al</sub>c<sub>Al</sub>)·dT/dt = Q<sub>motor</sub> + Q<sub>inv</sub> − k<sub>rad</sub>·(T<sub>rad in</sub> − T<sub>amb</sub>)</div>
 <p>k<sub>rad</sub> is the engine's heat per degree at the solved flow, for driving and stopped, fan on and off. The fan switches on the radiator inlet temperature with hysteresis. Load swings ±${fx(S.lapAmp * 100, 0)}% on a 75 s lap; the optional driver change stops the car for 3 minutes with no heat input.</p>
 <h3 style="margin-top:16px">Assumptions</h3>
 <ul>
  <li>Plain water properties; hoses do not exchange heat with the air; pump heat into the water neglected (≈60 W electrical).</li>
  <li>Rotor heat (1.67 kW at the design point) goes to air, not the loop.</li>
  <li>Clear tubing OD = ID + 1/4"; barb IDs ≈ 5/8" (3/4" barbs).</li>
  <li>Duct pressure recovery ${fx(S.Cp, 2)} and the shroud length (${GEO.shroudLen} mm) are estimates; shroud losses are not added to the core ΔP.</li>
  <li>Radiator fin geometry other than 20 FPI (louver angle 27°, louver pitch 1.2 mm, fin height 8 mm, tube 1.8 mm) uses Radiator Flow Lab defaults.</li>
  <li>EBP40, catch can and Y-fitting envelopes are approximate where no drawing was given.</li>
  <li>Bleed: air rises to the swirl pot (highest point) and leaves through the cap overflow line to the catch can; that line carries no flow in normal running and is left out of the hydraulics.</li>
 </ul>
 <p style="margin-top:10px;font-size:14px;color:var(--mute)">Sources: EMRAX 228 datasheet v1.7 (Ø228 × 86 mm, 12.9–13.5 kg); DTI HV-500 technical description (77 × 213 × 420 mm, 6.7 kg); FSAE Rules 2021 T.5.6; Chang &amp; Wang, IJHMT 40(3) 1997; Kim &amp; Bullard, Int. J. Refrig. 25, 2002; Churchill, Chem. Eng. 1977; component data from your brief.</p>
</div>`;
}

// ---------- CSV overlay ----------
$('csv').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const lines = String(rd.result).split(/\r?\n/).filter((l) => l.trim());
      let hi = lines.findIndex((l) => /time/i.test(l)); if (hi < 0) hi = 0;
      const head = lines[hi].split(',').map((x) => x.trim().replace(/"/g, ''));
      const col = (re) => head.findIndex((h) => re.test(h));
      const ti = col(/time/i), im = col(/motor/i), ii = col(/inv/i), ir = col(/rad.*in|in.*rad/i), ifn = col(/fan/i);
      if (ti < 0) throw new Error('no time column');
      const data = lines.slice(hi + 1).map((l) => l.split(',').map((x) => parseFloat(x.replace(/"/g, '')))).filter((r) => isFinite(r[ti]));
      let tmax = Math.max(...data.map((r) => r[ti])); const k = tmax > 20000 ? 1 / 60000 : 1 / 60;
      const series = (i) => i < 0 ? null : data.filter((r) => isFinite(r[i])).map((r) => [r[ti] * k, r[i]]);
      csv = { motor: series(im), inv: series(ii), radIn: series(ir) };
      $('csvNote').textContent = `Loaded ${data.length} rows: ${['motor', 'inverter', 'radiator inlet', 'fan'].filter((_, j) => [im, ii, ir, ifn][j] >= 0).join(', ') || 'no matching columns'}.`;
      charts();
    } catch (err) { csv = null; $('csvNote').textContent = 'Could not read that file: ' + err.message; }
  };
  rd.readAsText(f);
});

// ---------- pipeline ----------
let pending = false;
function changed(id) {
  for (const el of rows[id] || []) el.sync();
  if (id === 'preset') syncAll();
  if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; run(); }); }
  save();
}
function run() {
  solveAll();
  R.potV = potVolumeL();
  const cc = GEO.catchCan; R.canL = Math.PI * (cc.D / 2 - cc.wall) ** 2 * (cc.H - 2 * cc.wall) / 1e6;
  headline(); tables(); flags(); schematic(); charts(); update3D(); method();
  if (!$('info').hidden && $('info').dataset.part) R3.onPick($('info').dataset.part);
}
renderTabs(); renderCtl(); run();
const vis = { v: true };
new IntersectionObserver((es) => { for (const e of es) vis.v = e.isIntersecting; }).observe($('view'));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) { R3.autoSpin = false; segBtn('vSpin', null, false); }
let last = performance.now();
function tick(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (vis.v && R3.ok) R3.frame(reduce ? 0 : dt); requestAnimationFrame(tick); }
requestAnimationFrame(tick);
}
