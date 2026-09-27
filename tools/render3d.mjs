// Three-quarter pixel-art renderer (prototype). No dependencies.
//
// Models are built in code from boxes, tubes and balls, in world px: x east, y up, z south.
// The camera is an oblique three-quarter view. The ground keeps its top-down shape, so a map
// tile stays square as it is in the game, and every px of height lifts a point H px up the
// screen, so the south faces of things show. Every triangle is lit once from the top left;
// its material turns that light into a step on its colour ramp, so each facing and frame of
// a model is shaded the same way. Shadows are the model projected onto the ground along the
// light, returned as a separate mask for the engine to darken with.

export const H = 0.8;                                 // screen px up per px of height
export const LIGHT = norm([-0.5, 0.75, -0.45]);       // toward the light: west, up and north
const AMBIENT = 0.3, DIFFUSE = 0.8;

// ---- Vectors ----
export function sub(a, b){ return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function add(a, b){ return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function mulv(a, k){ return [a[0] * k, a[1] * k, a[2] * k]; }
export function dot(a, b){ return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a, b){ return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function len(a){ return Math.hypot(a[0], a[1], a[2]); }
export function norm(a){ const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export const lerp = (a, b, t) => a + (b - a) * t;

// ---- 3×4 affine matrices, row-major ----
export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
export function mul(a, b){
  const o = new Array(12);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++){
    o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + (c === 3 ? a[r * 4 + 3] : 0);
  }
  return o;
}
export function apply(m, p){
  return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
}
export const translate = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
export const scale = (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0];
// Heading, clockwise seen from above: turns forward (0, 0, -1) toward east (1, 0, 0).
export function rotY(a){ const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0]; }
export function rotX(a){ const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; }
export function rotZ(a){ const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; }
// Maps the unit tube (local y from 0 to 1, radius 1) onto the segment from p to q.
export function along(p, q){
  const d = sub(q, p), n = norm(d), helper = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const a = norm(cross(helper, n)), b = cross(n, a);
  return [a[0], d[0], b[0], p[0], a[1], d[1], b[1], p[1], a[2], d[2], b[2], p[2]];
}

// ---- Models ----
// Every primitive is convex, so a point inside it orients each face's normal outward
// whatever the winding (mirrored parts included).
export class Model {
  constructor(){ this.tris = []; }
  tri(a, b, c, mat, inside){
    let n = cross(sub(b, a), sub(c, a));
    if (len(n) < 1e-9) return;
    n = norm(n);
    if (dot(n, sub(a, inside)) < 0) n = mulv(n, -1);
    this.tris.push({ v: [a, b, c], n, mat });
  }
  quad(a, b, c, d, mat, inside){ this.tri(a, b, c, mat, inside); this.tri(a, c, d, mat, inside); }
  // Unit cube centred on the origin.
  box(m, mat){
    const P = [];
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) P.push(apply(m, [x, y, z]));
    const k = apply(m, [0, 0, 0]);
    for (const [a, b, c, d] of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) this.quad(P[a], P[b], P[c], P[d], mat, k);
    return this;
  }
  // Tube along local y from 0 to 1, radius r0 at the bottom and r1 at the top, with caps.
  tube(m, mat, r0 = 1, r1 = r0, seg = 8){
    const ring = (y, r) => Array.from({ length: seg }, (_, i) => { const a = i / seg * Math.PI * 2; return apply(m, [Math.cos(a) * r, y, Math.sin(a) * r]); });
    const A = ring(0, r0), B = ring(1, r1), k = apply(m, [0, 0.5, 0]), c0 = apply(m, [0, 0, 0]), c1 = apply(m, [0, 1, 0]);
    for (let i = 0; i < seg; i++){
      const j = (i + 1) % seg;
      this.quad(A[i], A[j], B[j], B[i], mat, k);
      this.tri(c0, A[i], A[j], mat, k);
      this.tri(c1, B[i], B[j], mat, k);
    }
    return this;
  }
  // Unit sphere.
  ball(m, mat, seg = 10){
    const rows = Math.max(3, seg >> 1), k = apply(m, [0, 0, 0]);
    const P = (i, j) => { const t = i / rows * Math.PI, a = j / seg * Math.PI * 2; return apply(m, [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)]); };
    for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) this.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), mat, k);
    return this;
  }
}

// ---- Rendering ----
// Draws `model` into a w×h buffer at `res` art px per world px, with the world origin (the
// ground point under the model) at pixel (ox, oy). Returns per-pixel depth, material, light
// and the ground shadow mask.
export function render(model, { w, h, ox, oy, res }){
  const N = w * h, depth = new Float32Array(N).fill(-Infinity), mat = new Array(N).fill(null);
  const light = new Float32Array(N), shadow = new Uint8Array(N);
  const proj = p => [ox + p[0] * res, oy + (p[2] - p[1] * H) * res, p[1] + H * p[2]];
  const onGround = p => { const k = p[1] / LIGHT[1]; return proj([p[0] - LIGHT[0] * k, 0, p[2] - LIGHT[2] * k]); };
  for (const t of model.tris){
    const I = t.mat.emissive ? 1 : AMBIENT + DIFFUSE * Math.max(0, dot(t.n, LIGHT));
    raster(t.v.map(proj), w, h, (i, d) => { if (d > depth[i]){ depth[i] = d; mat[i] = t.mat; light[i] = I; } });
    raster(t.v.map(onGround), w, h, i => { shadow[i] = 1; });
  }
  return { w, h, depth, mat, light, shadow };
}

// Fills the pixels whose centres fall inside the projected triangle, with interpolated depth.
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
    plot(y * w + x, w0 * a[2] + w1 * b[2] + w2 * c[2]);
  }
}

// Turns a render into palette indices (0 = transparent):
//   - each material's ramp step comes from the pixel's light;
//   - a pixel just behind a much nearer neighbour steps two darker, which draws the lines
//     between parts;
//   - a 1 px outline goes around the silhouette.
export function toPixels(r, { outline, edge = 2.5 }){
  const { w, h, depth, mat, light } = r, out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++){
    const m = mat[i];
    if (!m) continue;
    const ramp = m.ramp, s = Math.max(0, Math.min(1, (light[i] - AMBIENT) / DIFFUSE));
    let step = m.emissive ? ramp.length - 1 : Math.round(s * (ramp.length - 1));
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mat[j]) continue;
      if (depth[j] - depth[i] > edge && !m.emissive){ step = Math.max(0, step - 2); break; }
    }
    out[i] = ramp[step];
  }
  const lined = out.slice();
  for (let i = 0; i < w * h; i++){
    if (out[i]) continue;
    const x = i % w, y = (i / w) | 0;
    if ((x > 0 && out[i - 1]) || (x < w - 1 && out[i + 1]) || (y > 0 && out[i - w]) || (y < h - 1 && out[i + w])) lined[i] = outline;
  }
  return lined;
}
