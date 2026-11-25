// Geometry helpers shared with Radiator Flow Lab
const M4 = {
  id() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  persp(fov, a, n, f) { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / a; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
  ortho(l, r, b, t, n, f) { const o = new Float32Array(16); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o; },
  look(e, c, u) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  },
  mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
  tr(x, y, z) { const o = M4.id(); o[12] = x; o[13] = y; o[14] = z; return o; },
  rz(a) { const o = M4.id(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; }
};

// ---------------- geometry ----------------
class GB {
  constructor() { this.P = []; this.N = []; this.U = []; this.I = []; }
  v(p, n, u) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.U.push(u ? u[0] : 0, u ? u[1] : 0); return this.P.length / 3 - 1; }
  q(a, b, c, d) { this.I.push(a, b, c, a, c, d); }
  add(m, off) { const b = this.P.length / 3; for (let i = 0; i < m.P.length; i += 3) { this.P.push(m.P[i] + off[0], m.P[i + 1] + off[1], m.P[i + 2] + off[2]); } this.N.push(...m.N); this.U.push(...m.U); for (const i of m.I) this.I.push(i + b); return this; }
  done() { return { P: new Float32Array(this.P), N: new Float32Array(this.N), U: new Float32Array(this.U), I: new Uint32Array(this.I) }; }
}
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function roundedBox(w, h, d, r, k = 6) {
  const g = new GB(), H = [w / 2, h / 2, d / 2];
  r = Math.min(r, H[0], H[1], H[2]) * 0.999;
  const co = (hh) => { const a = []; for (let i = 0; i <= k; i++) a.push(-hh + r * i / k); a.push(-hh * 0.33, hh * 0.33); for (let i = k; i >= 0; i--) a.push(hh - r * i / k); a.sort((x, y) => x - y); return a.filter((v, i, s) => i === 0 || Math.abs(v - s[i - 1]) > 1e-6); };
  for (let ax = 0; ax < 3; ax++) for (const sg of [-1, 1]) {
    const b = (ax + 1) % 3, c = (ax + 2) % 3, cb = co(H[b]), cc = co(H[c]), base = g.P.length / 3;
    for (let i = 0; i < cb.length; i++) for (let j = 0; j < cc.length; j++) {
      const p = [0, 0, 0]; p[ax] = sg * H[ax]; p[b] = cb[i]; p[c] = cc[j];
      const inner = p.map((v, a) => Math.max(-(H[a] - r), Math.min(H[a] - r, v)));
      let dv = [p[0] - inner[0], p[1] - inner[1], p[2] - inner[2]], l = Math.hypot(...dv);
      const n = l > 1e-6 ? dv.map((v) => v / l) : (() => { const f = [0, 0, 0]; f[ax] = sg; return f; })();
      g.v([inner[0] + n[0] * r, inner[1] + n[1] * r, inner[2] + n[2] * r], n, [i / (cb.length - 1), j / (cc.length - 1)]);
    }
    for (let i = 0; i < cb.length - 1; i++) for (let j = 0; j < cc.length - 1; j++) { const a = base + i * cc.length + j; g.q(a, a + cc.length, a + cc.length + 1, a + 1); }
  }
  return g.done();
}
function sweep(path, rad, seg = 20, closed = false) {
  const g = new GB(), n = path.length;
  const T = path.map((p, i) => { const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)]; if (closed) { const a2 = path[(i - 1 + n) % n], b2 = path[(i + 1) % n]; return nrm([b2[0] - a2[0], b2[1] - a2[1], b2[2] - a2[2]]); } return nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]); });
  let up = Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let Nn = nrm(cross(cross(T[0], up), T[0]));
  let len = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) { const t = T[i]; const b = cross(t, Nn); Nn = nrm(cross(b, t)); len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]); }
    const B = cross(T[i], Nn), R = typeof rad === 'function' ? rad(i / (n - 1)) : rad;
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nn = [Nn[0] * c + B[0] * s, Nn[1] * c + B[1] * s, Nn[2] * c + B[2] * s];
      g.v([path[i][0] + nn[0] * R, path[i][1] + nn[1] * R, path[i][2] + nn[2] * R], nn, [len, j / seg]);
    }
  }
  const rows = closed ? n : n - 1;
  for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = ((i + 1) % n) * (seg + 1) + j; g.q(a, b, b + 1, a + 1); }
  return g.done();
}
const arcPts = (c, r, a0, a1, plane, k = 12) => { const o = []; for (let i = 0; i <= k; i++) { const a = a0 + (a1 - a0) * i / k; const u = Math.cos(a) * r, v = Math.sin(a) * r; o.push(plane === 'xz' ? [c[0] + u, c[1], c[2] + v] : plane === 'xy' ? [c[0] + u, c[1] + v, c[2]] : [c[0], c[1] + u, c[2] + v]); } return o; };
const linePts = (a, b, k = 4) => { const o = []; for (let i = 0; i <= k; i++) o.push([a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k, a[2] + (b[2] - a[2]) * i / k]); return o; };
const joinPts = (...ls) => { const o = []; for (const l of ls) for (const p of l) { const q = o[o.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-4) o.push(p); } return o; };
function cylinder(r, h, seg = 32, caps = true) { // along y, centered
  const g = new GB();
  for (const y of [-h / 2, h / 2]) for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; g.v([Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a), 0, Math.sin(a)], [j / seg * Math.PI * 2 * r, y]); }
  for (let j = 0; j < seg; j++) g.q(j, j + seg + 1, j + seg + 2, j + 1);
  if (caps) for (const [y, ny] of [[-h / 2, -1], [h / 2, 1]]) { const c = g.v([0, y, 0], [0, ny, 0], [0, 0]); const b = g.P.length / 3; for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; g.v([Math.cos(a) * r, y, Math.sin(a) * r], [0, ny, 0], [Math.cos(a) * r, Math.sin(a) * r]); } for (let j = 0; j < seg; j++) g.I.push(c, b + j, b + j + 1); }
  return g.done();
}
const rotXYZ = (m, f) => { const P = new Float32Array(m.P.length), N = new Float32Array(m.N.length); for (let i = 0; i < m.P.length; i += 3) { const a = f([m.P[i], m.P[i + 1], m.P[i + 2]]), b = f([m.N[i], m.N[i + 1], m.N[i + 2]]); P.set(a, i); N.set(b, i); } return { P, N, U: m.U, I: m.I }; };
const yToZ = (v) => [v[0], v[2], -v[1]];
const yToX = (v) => [v[1], -v[0], v[2]];
function stadiumTube(L, Th, D, seg = 10) {
  const g = new GB(), a = Th / 2, zc = D / 2 - a, ring = [];
  for (let i = 0; i <= seg; i++) { const t = -Math.PI / 2 + Math.PI * i / seg; ring.push([Math.sin(t) * a, zc + Math.cos(t) * a, Math.sin(t), Math.cos(t)]); }
  for (let i = 0; i <= seg; i++) { const t = Math.PI / 2 + Math.PI * i / seg; ring.push([Math.sin(t) * a, -zc + Math.cos(t) * a, Math.sin(t), Math.cos(t)]); }
  ring.push(ring[0]);
  for (const x of [-L / 2, L / 2]) for (const [y, z, ny, nz] of ring) g.v([x, y, z], [0, ny, nz], [x, 0]);
  const m = ring.length; for (let i = 0; i < m - 1; i++) g.q(i, i + m, i + m + 1, i + 1);
  return g.done();
}
function finRow(W, Fl, D, Fp) {
  const g = new GB(), rc = Math.min(Fp / 2, Fl / 3), nw = Math.floor(W / Fp), y0 = -Fl / 2, y1 = Fl / 2, pts = [];
  const x0 = -W / 2 + (W - (nw - 1) * Fp) / 2;
  for (let i = 0; i < nw; i++) {
    const x = x0 + i * Fp, upward = i % 2 === 0;
    const ya = upward ? y0 + rc : y1 - rc, yb = upward ? y1 - rc : y0 + rc;
    for (let k = 0; k <= 3; k++) { const y = ya + (yb - ya) * k / 3; pts.push([x, y, upward ? -1 : 1, 0, (y - y0) / Fl]); }
    if (i < nw - 1) {
      const cx = x + Fp / 2, cy = upward ? y1 - rc : y0 + rc;
      for (let k = 1; k < 6; k++) { const t = Math.PI - Math.PI * k / 6; const s = upward ? 1 : -1; const nx = Math.cos(t), ny = Math.sin(t) * s; pts.push([cx + nx * Fp / 2, cy + ny * rc, nx, ny, -1]); }
    }
  }
  for (const z of [-D / 2, D / 2]) for (const [x, y, nx, ny, u] of pts) g.v([x, y, z], [nx, ny, 0], [u, z]);
  const m = pts.length; for (let i = 0; i < m - 1; i++) g.q(i, i + m, i + m + 1, i + 1);
  return g.done();
}
function annulusPlate(w, h, R, thick, seg = 72) { // rectangle with circular hole, in xy, thickness along z
  const g = new GB();
  for (const [z, nz] of [[thick / 2, 1], [-thick / 2, -1]]) {
    const b = g.P.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const k = Math.min(Math.abs(c) > 1e-6 ? (w / 2) / Math.abs(c) : 1e9, Math.abs(s) > 1e-6 ? (h / 2) / Math.abs(s) : 1e9);
      g.v([c * R, s * R, z], [0, 0, nz], [0, 0]); g.v([c * k, s * k, z], [0, 0, nz], [1, 0]);
    }
    for (let i = 0; i < seg; i++) { const a = b + i * 2; g.q(a, a + 1, a + 3, a + 2); }
  }
  return g.done();
}
function bladeMesh(R, hub, nB) {
  const g = new GB(), nr = 7, nc = 6;
  for (let b = 0; b < nB; b++) {
    const base = g.P.length / 3, a0 = b / nB * Math.PI * 2;
    for (let i = 0; i <= nr; i++) for (let j = 0; j <= nc; j++) {
      const r = hub + (R - hub) * i / nr, c = j / nc - 0.5;
      const span = (0.62 - 0.18 * i / nr) * (1 + 0.25 * Math.sin(i / nr * Math.PI));
      const pitch = 0.75 - 0.35 * i / nr;
      const a = a0 + c * span + 0.25 * (i / nr) ** 2;
      const z = -c * span * r * Math.tan(pitch) * 0.5 + 0.9 * (c * c - 0.25) * r * 0.08;
      g.v([Math.cos(a) * r, Math.sin(a) * r, z], [0, 0, 1], [i / nr, j / nc]);
    }
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { const a = base + i * (nc + 1) + j; g.q(a, a + nc + 1, a + nc + 2, a + 1); }
  }
  const m = g.done();
  // recompute normals
  const N = new Float32Array(m.P.length);
  for (let t = 0; t < m.I.length; t += 3) { const [a, b, c] = [m.I[t] * 3, m.I[t + 1] * 3, m.I[t + 2] * 3]; const e1 = [m.P[b] - m.P[a], m.P[b + 1] - m.P[a + 1], m.P[b + 2] - m.P[a + 2]], e2 = [m.P[c] - m.P[a], m.P[c + 1] - m.P[a + 1], m.P[c + 2] - m.P[a + 2]]; const n = cross(e1, e2); for (const v of [a, b, c]) { N[v] += n[0]; N[v + 1] += n[1]; N[v + 2] += n[2]; } }
  for (let i = 0; i < N.length; i += 3) { const n = nrm([N[i], N[i + 1], N[i + 2]]); N[i] = n[0]; N[i + 1] = n[1]; N[i + 2] = n[2]; }
  m.N = N; return m;
}

