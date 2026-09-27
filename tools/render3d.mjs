// Three-quarter pixel-art renderer (prototype). No dependencies.
//
// Models are built in code from boxes, tubes, balls and lathed profiles, in world px: x east,
// y up, z south. The camera is an oblique three-quarter view. The ground keeps its top-down
// shape, so a map tile stays square as it is in the game, and every px of height lifts a point
// H px up the screen, so the south faces of things show.
//
// Shading, per sample:
//   - one light from the top left (diffuse), with a glint where a material is shiny;
//   - ambient occlusion: a sample with nearer surfaces close around it on screen darkens,
//     which shades creases and the places where parts meet;
//   - a material may add a pattern (seams, stripes, grime) from the sample's model position,
//     so patterns stay on the surface whatever the heading;
//   - the light picks a step on the material's colour ramp.
// Each art px takes the most common colour of its ss × ss samples. Then a pixel just behind
// a much nearer neighbour steps darker (lines between parts) and a 1 px outline goes around
// the silhouette. Shadows are the model projected onto the ground along the light, returned
// as a mask for the engine to darken with.

export const H = 0.8;                                 // screen px up per px of height
export const LIGHT = norm([-0.5, 0.75, -0.45]);       // toward the light: west, up and north
export const VIEW = norm([0, 1, H]);                  // toward the viewer
const AMBIENT = 0.3, DIFFUSE = 0.8, TAU = Math.PI * 2;

// ---- Vectors ----
export function sub(a, b){ return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function add(a, b){ return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function mulv(a, k){ return [a[0] * k, a[1] * k, a[2] * k]; }
export function dot(a, b){ return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a, b){ return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function len(a){ return Math.hypot(a[0], a[1], a[2]); }
export function norm(a){ const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---- 3×4 affine matrices, row-major ----
export function mul(...ms){
  return ms.reduce((a, b) => {
    const o = new Array(12);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++){
      o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + (c === 3 ? a[r * 4 + 3] : 0);
    }
    return o;
  });
}
export function apply(m, p){
  return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
}
export const translate = (x, y, z) => Array.isArray(x) ? [1, 0, 0, x[0], 0, 1, 0, x[1], 0, 0, 1, x[2]] : [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
export const scale = (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0];
// Heading, clockwise seen from above: turns forward (0, 0, -1) toward east (1, 0, 0).
export function rotY(a){ const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0]; }
// rotX(π/2) turns local +y to +z (backward); rotX(-π/2) turns it to -z (forward).
export function rotX(a){ const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; }
export function rotZ(a){ const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; }
// Maps local y from 0 to 1 onto the segment from p to q (x and z stay unit length).
export function along(p, q){
  const d = sub(q, p), n = norm(d), helper = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const a = norm(cross(helper, n)), b = cross(n, a);
  return [a[0], d[0], b[0], p[0], a[1], d[1], b[1], p[1], a[2], d[2], b[2], p[2]];
}
// Inverse transpose of the 3×3 part, for normals (it keeps them right under uneven scaling
// and mirroring).
function normalMatrix(m){
  const [a, b, c, , d, e, f, , g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const G = b * f - c * e, Hh = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C;
  return [A, B, C, D, E, F, G, Hh, I].map(v => v / det);
}
const applyN = (N, n) => norm([N[0] * n[0] + N[1] * n[1] + N[2] * n[2], N[3] * n[0] + N[4] * n[1] + N[5] * n[2], N[6] * n[0] + N[7] * n[1] + N[8] * n[2]]);

// ---- Noise, for grime and wear ----
function hash3(x, y, z){
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smooth value noise in 0..1.
export function noise3(x, y, z){
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), s = t => t * t * (3 - 2 * t);
  const u = s(x - X), v = s(y - Y), w = s(z - Z), n = (i, j, k) => hash3(X + i, Y + j, Z + k);
  return lerp(lerp(lerp(n(0, 0, 0), n(1, 0, 0), u), lerp(n(0, 1, 0), n(1, 1, 0), u), v),
              lerp(lerp(n(0, 0, 1), n(1, 0, 1), u), lerp(n(0, 1, 1), n(1, 1, 1), u), v), w);
}

// ---- Models ----
// Triangles carry a normal per corner, so curved surfaces shade smoothly and flat faces
// stay flat. Positions stay in model space; the heading is applied when rendering.
export class Model {
  constructor(){ this.tris = []; }
  push(m, N, mat, pts, ns){ this.tris.push({ p: pts.map(q => apply(m, q)), n: ns.map(q => applyN(N, q)), mat }); }
  // Unit cube centred on the origin.
  box(m, mat){
    const N = normalMatrix(m);
    for (const [axis, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]){
      const n = [0, 0, 0], u = [0, 0, 0], v = [0, 0, 0];
      n[axis] = s; u[(axis + 1) % 3] = 0.5; v[(axis + 2) % 3] = 0.5;
      const c = mulv(n, 0.5), q = [add(add(c, u), v), add(sub(c, u), v), sub(sub(c, u), v), sub(add(c, u), v)];
      this.push(m, N, mat, [q[0], q[1], q[2]], [n, n, n]);
      this.push(m, N, mat, [q[0], q[2], q[3]], [n, n, n]);
    }
    return this;
  }
  // Tube along local y from 0 to 1, radius r0 at the bottom and r1 at the top.
  tube(m, mat, r0 = 1, r1 = r0, seg = 12, caps = true){
    return this.lathe(m, mat, [[r0, 0, 1], [r1, 1, 1]], seg, caps);
  }
  // Unit sphere.
  ball(m, mat, seg = 16){
    const N = normalMatrix(m), rows = seg >> 1;
    const P = (i, j) => { const t = i / rows * Math.PI, a = j / seg * TAU; return [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)]; };
    for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++){
      const a = P(i, j), b = P(i, j + 1), c = P(i + 1, j + 1), d = P(i + 1, j);
      this.push(m, N, mat, [a, b, c], [a, b, c]);
      this.push(m, N, mat, [a, c, d], [a, c, d]);
    }
    return this;
  }
  // Revolves a profile of [radius, y, sharp?] points (bottom to top) around local y. Normals
  // are averaged across a smooth point and kept separate across a sharp one; flat caps close
  // any end whose radius isn't 0.
  lathe(m, mat, profile, seg = 16, caps = true){
    const N = normalMatrix(m), K = profile.length;
    const segN = [];
    for (let k = 0; k < K - 1; k++){
      const dr = profile[k + 1][0] - profile[k][0], dy = profile[k + 1][1] - profile[k][1], l = Math.hypot(dr, dy) || 1;
      segN.push([dy / l, -dr / l]);
    }
    const smooth = k => { const a = segN[k - 1], b = segN[k], s = a && b ? [a[0] + b[0], a[1] + b[1]] : (a || b), l = Math.hypot(s[0], s[1]) || 1; return [s[0] / l, s[1] / l]; };
    const P = (r, y, a) => [Math.cos(a) * r, y, Math.sin(a) * r], Nr = ([nr, ny], a) => [nr * Math.cos(a), ny, nr * Math.sin(a)];
    for (let k = 0; k < K - 1; k++){
      const [r0, y0] = profile[k], [r1, y1] = profile[k + 1];
      const n0 = profile[k][2] ? segN[k] : smooth(k), n1 = profile[k + 1][2] ? segN[k] : smooth(k + 1);
      for (let j = 0; j < seg; j++){
        const a0 = j / seg * TAU, a1 = (j + 1) / seg * TAU;
        this.push(m, N, mat, [P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a1)], [Nr(n0, a0), Nr(n0, a1), Nr(n1, a1)]);
        this.push(m, N, mat, [P(r0, y0, a0), P(r1, y1, a1), P(r1, y1, a0)], [Nr(n0, a0), Nr(n1, a1), Nr(n1, a0)]);
      }
    }
    if (caps) for (const [r, y, ny] of [[profile[0][0], profile[0][1], -1], [profile[K - 1][0], profile[K - 1][1], 1]]){
      if (r <= 0) continue;
      for (let j = 0; j < seg; j++){
        const a0 = j / seg * TAU, a1 = (j + 1) / seg * TAU, n = [0, ny, 0];
        this.push(m, N, mat, [[0, y, 0], P(r, y, a0), P(r, y, a1)], [n, n, n]);
      }
    }
    return this;
  }
}

// ---- Rendering ----
// Renders `model` turned to `heading` into a w×h sprite at `res` art px per world px, with the
// model origin at pixel (ox, oy). `lift` is the screen px up per px of height (default H). Materials: { ramp: palette indices dark to light, spec?,
// shine?, emissive?, pattern?(p) → ramp steps to add, or another material to use there }.
// Returns palette indices (0 = transparent) and the ground shadow mask.
export function renderSprite(model, { w, h, ox, oy, res, heading = 0, ss = 2, outline, edge = 2.5, ao = 0.5, lift = H }){
  const L = lift, half = norm(add(LIGHT, norm([0, 1, L]))), S = ss, W = w * S, HH = h * S, N = W * HH, r = res * S, R = rotY(heading);
  const depth = new Float32Array(N).fill(-Infinity), tri = new Int32Array(N).fill(-1);
  const b0 = new Float32Array(N), b1 = new Float32Array(N), shadowS = new Uint8Array(N);
  const tris = model.tris.map(t => ({ ...t, w: t.p.map(p => apply(R, p)), wn: t.n.map(n => apply(R, n)) }));
  const proj = p => [ox * S + p[0] * r, oy * S + (p[2] - p[1] * L) * r, p[1] + L * p[2]];
  const ground = p => { const k = p[1] / LIGHT[1]; return proj([p[0] - LIGHT[0] * k, 0, p[2] - LIGHT[2] * k]); };
  tris.forEach((t, id) => {
    raster(t.w.map(proj), W, HH, (i, d, w0, w1) => { if (d > depth[i]){ depth[i] = d; tri[i] = id; b0[i] = w0; b1[i] = w1; } });
    raster(t.w.map(ground), W, HH, i => { shadowS[i] = 1; });
  });

  // Shade every sample.
  const pal = new Uint8Array(N), matS = new Array(N), stepS = new Int8Array(N);
  const aoR = 2 * S, aoOff = [];
  for (let dy = -aoR; dy <= aoR; dy++) for (let dx = -aoR; dx <= aoR; dx++) if ((dx || dy) && dx * dx + dy * dy <= aoR * aoR) aoOff.push([dx, dy]);
  for (let i = 0; i < N; i++){
    const id = tri[i];
    if (id < 0) continue;
    const t = tris[id], w0 = b0[i], w1 = b1[i], w2 = 1 - w0 - w1;
    const n = norm(add(add(mulv(t.wn[0], w0), mulv(t.wn[1], w1)), mulv(t.wn[2], w2)));
    const p = add(add(mulv(t.p[0], w0), mulv(t.p[1], w1)), mulv(t.p[2], w2));
    let mat = t.mat, delta = 0;
    if (mat.pattern){ const v = mat.pattern(p, n); if (typeof v === 'number') delta = v; else if (v) mat = v; }
    const top = mat.ramp.length - 1;
    let step;
    if (mat.emissive) step = top;
    else {
      // A neighbour occludes when it stands in front of where this sample's own surface would
      // be at that spot, so steep faces don't shade themselves.
      const x = i % W, y = (i / W) | 0, facing = n[1] + L * n[2];
      let occ = 0, seen = 0;
      if (facing > 0.15) for (const [dx, dy] of aoOff){
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= HH) continue;
        const j = ny * W + nx, X = dx / r, Y = dy / r, up = -(n[0] * X + n[2] * Y) / facing;
        seen++;
        if (tri[j] >= 0 && depth[j] - (depth[i] + up * (1 + L * L) + L * Y) > 0.8) occ++;
      }
      const shade = 1 - ao * Math.min(1, 2 * occ / (seen || 1));
      const spec = (mat.spec || 0) * Math.pow(Math.max(0, dot(n, half)), mat.shine || 20);
      const I = (AMBIENT + DIFFUSE * Math.max(0, dot(n, LIGHT))) * shade + spec;
      step = Math.round(Math.max(0, Math.min(1, (I - AMBIENT) / DIFFUSE)) * top) + delta;
      step = Math.max(0, Math.min(top, step));
    }
    pal[i] = mat.ramp[step]; matS[i] = mat; stepS[i] = step;
  }

  // Resolve samples to art px: the most common colour (ties go to the nearest sample).
  const px = new Uint8Array(w * h), fMat = new Array(w * h), fStep = new Int8Array(w * h), fDepth = new Float32Array(w * h), shadow = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const k = y * w + x, cand = [];
    let sh = 0, near = -Infinity;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++){
      const j = (y * S + sy) * W + x * S + sx;
      if (shadowS[j]) sh++;
      if (tri[j] >= 0){ cand.push(j); near = Math.max(near, depth[j]); }
    }
    if (sh * 2 >= S * S) shadow[k] = 1;
    if (cand.length * 2 < S * S) continue;
    let best = cand[0], bestN = 0;
    for (const j of cand){
      let c = 0;
      for (const q of cand) if (pal[q] === pal[j]) c++;
      if (c > bestN || (c === bestN && depth[j] > depth[best])){ best = j; bestN = c; }
    }
    px[k] = pal[best]; fMat[k] = matS[best]; fStep[k] = stepS[best]; fDepth[k] = near;
  }

  // Lines between parts, then the outline.
  const out = px.slice();
  for (let k = 0; k < w * h; k++){
    const m = fMat[k];
    if (!px[k] || m.emissive) continue;
    const x = k % w, y = (k / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !px[j]) continue;
      if (fDepth[j] - fDepth[k] > edge){ out[k] = m.ramp[Math.max(0, fStep[k] - 2)]; break; }
    }
  }
  const lined = out.slice();
  for (let k = 0; k < w * h; k++){
    if (out[k]) continue;
    const x = k % w, y = (k / w) | 0;
    if ((x > 0 && out[k - 1]) || (x < w - 1 && out[k + 1]) || (y > 0 && out[k - w]) || (y < h - 1 && out[k + w])) lined[k] = outline;
  }
  return { px: lined, shadow };
}

// Calls plot(index, depth, w0, w1) for the samples whose centres fall inside the triangle.
function raster([a, b, c], w, h, plot){
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){
    const px = x + 0.5, py = y + 0.5;
    const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
    const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
    const w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    plot(y * w + x, w0 * a[2] + w1 * b[2] + w2 * c[2], w0, w1);
  }
}
