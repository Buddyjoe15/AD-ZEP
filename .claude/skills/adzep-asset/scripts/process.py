#!/usr/bin/env python3
"""AD-ZEP sprite processing. Tiles are 192 art px (48 world px at 4 art px per
world px). Every output part is a square transparent PNG of footprint x 192 px
(192x192 for a standard 1-tile unit, 384x384 for 2x2), whose center is the
unit's pivot, so parts stack with no offsets.

Subcommands
  inspect  IMG...            size, real alpha, content bbox, cyan-light count, white-bg check
  body     IMG --out F --meta M [--tiles T] [--center X Y] [--half H]
           square crop around CENTER (default: opaque-bbox center; for turret units use
           the mount-hole center), scaled to T x 192 px (T = footprint in tiles,
           default 1; 2 for a 2x2 unit, 0.667 for a drone-sized 128 px unit). Saves
           the frame and size to META so turret, legs, preview and check match.
  turret   IMG --meta M --pivot PX PY --scale S --out F
           turret PIVOT (source px, usually the middle of its base plate) lands on the
           body center; S = turret size relative to the body source image.
  legs     IMG --meta M --outdir D [--core-radius R] [--angles a1 a2 ...]
           split radial legs off a body image: writes core.png + leg0..N.png, hip
           pivots and alternating gait groups into META. Auto-detects if not given.
  preview  --meta M --parts D --out F   rest pose (+ two gait poses if legs) at 3x
  check    DIR [--meta M]                confirm every PNG is the META size (default 192)
"""
import sys, json, math, argparse, glob, os
import numpy as np
from PIL import Image

TILE = 192  # art px per tile
SIZE = TILE  # canvas side for this unit; set from --tiles or meta.json
def load(p): return Image.open(p).convert('RGBA')
def harden(im, t=100):
    a = im.split()[3].point(lambda v: 255 if v > t else 0); im.putalpha(a); return im
def opaque_bbox(d, t=128):
    ys, xs = np.where(d[:, :, 3] > t); return xs.min(), ys.min(), xs.max(), ys.max()
def frame(im, cx, cy, half):
    return harden(im.crop((cx-half, cy-half, cx+half, cy+half)).resize((SIZE, SIZE), Image.LANCZOS))
def rmeta(p): return json.load(open(p)) if os.path.exists(p) else {}
def wmeta(p, m): json.dump(m, open(p, 'w'), indent=1)

def cmd_inspect(a):
    for p in a.imgs:
        im = load(p); d = np.array(im).astype(int)
        corner = d[3, 3]; x0, y0, x1, y1 = opaque_bbox(d)
        cyan = int(((d[:, :, 3] > 200) & (d[:, :, 2] > 170) & (d[:, :, 1] > 160) & (d[:, :, 0] < 120)).sum())
        white = ((d[:, :, 3] > 200) & (d[:, :, :3].min(2) > 245)).sum() / d[:, :, 3].size
        magenta = ((d[:, :, 3] > 200) & (d[:, :, 0] > 230) & (d[:, :, 1] < 40) & (d[:, :, 2] > 230)).sum() / d[:, :, 3].size
        print(f"{p}: size={im.size} transparent_bg={corner[3]==0} opaque_bbox=({x0},{y0},{x1},{y1}) "
              f"bbox_center=({(x0+x1)//2},{(y0+y1)//2}) cyan_px={cyan} white_bg_frac={white:.2f} magenta_bg_frac={magenta:.2f}")

def cmd_keyout(a):
    """Remove a solid white or magenta background (use only if inspect shows transparent_bg=False)."""
    d = np.array(load(a.img)).astype(int)
    if a.color == 'magenta':
        bg = (d[:, :, 0] > 200) & (d[:, :, 1] < 70) & (d[:, :, 2] > 200)
    else:  # flood-fill white from the edges so white highlights inside the art survive
        from collections import deque
        near = d[:, :, :3].min(2) > 235; h, w = near.shape; bg = np.zeros_like(near); q = deque()
        for x in range(w):
            for y in (0, h-1):
                if near[y, x] and not bg[y, x]: bg[y, x] = 1; q.append((y, x))
        for y in range(h):
            for x in (0, w-1):
                if near[y, x] and not bg[y, x]: bg[y, x] = 1; q.append((y, x))
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y+dy, x+dx
                if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not bg[ny, nx]: bg[ny, nx] = 1; q.append((ny, nx))
    d[bg, 3] = 0; Image.fromarray(d.astype('uint8')).save(a.out); print(f"keyout -> {a.out} removed={bg.mean():.2f}")

def cmd_body(a):
    im = load(a.img); d = np.array(im)
    x0, y0, x1, y1 = opaque_bbox(d)
    cx, cy = a.center if a.center else ((x0+x1)//2, (y0+y1)//2)
    half = a.half or int(max(cx-x0, x1-cx, cy-y0, y1-cy) * 1.04) + 1
    frame(im, cx, cy, half).save(a.out)
    m = rmeta(a.meta); m.update({'src_center': [int(cx), int(cy)], 'src_half': half, 'size': SIZE}); wmeta(a.meta, m)
    print(f"body -> {a.out}  center=({cx},{cy}) half={half}")

def cmd_turret(a):
    m = rmeta(a.meta); half = m['src_half']; k = SIZE/(2*half)
    tur = load(a.img); s = a.scale
    big = int(max(tur.size) * 2.2)
    canvas = Image.new('RGBA', (big, big)); canvas.alpha_composite(tur, (big//2 - int(a.pivot[0]), big//2 - int(a.pivot[1])))
    side = round(big * s * k); side += side % 2
    t = harden(canvas.resize((side, side), Image.LANCZOS))
    out = Image.new('RGBA', (SIZE, SIZE))
    if side > SIZE:
        c = (side-SIZE)//2; out.alpha_composite(t.crop((c, c, c+SIZE, c+SIZE)))
    else:
        out.alpha_composite(t, ((SIZE-side)//2, (SIZE-side)//2))
    out.save(a.out)
    d = np.array(out); ys, xs = np.where(d[:, :, 3] > 0); top = ys.min()
    m.update({'turret_scale': s, 'turret_pivot_src': a.pivot,
              'muzzle_guess': [round(float(xs[ys == top].mean())-SIZE/2, 1), int(top-SIZE/2)]}); wmeta(a.meta, m)
    print(f"turret -> {a.out}  content={out.getbbox()}  muzzle_guess={m['muzzle_guess']}")

def cmd_legs(a):
    m = rmeta(a.meta); cx, cy = m['src_center']; half = m['src_half']; k = SIZE/(2*half)
    d = np.array(load(a.img))
    yy, xx = np.mgrid[0:d.shape[0], 0:d.shape[1]]
    r = np.hypot(xx-cx, yy-cy); ang = (np.degrees(np.arctan2(yy-cy, xx-cx)) + 360) % 360
    op = d[:, :, 3] > 128
    R = a.core_radius
    if not R:
        ext = []
        for deg in range(0, 360, 5):
            t = math.radians(deg); rr = 0
            for q in range(0, half):
                x = int(cx+q*math.cos(t)); y = int(cy+q*math.sin(t))
                if 0 <= x < d.shape[1] and 0 <= y < d.shape[0] and op[y, x]: rr = q
            ext.append(rr)
        R = int(np.percentile(ext, 25)) + 15
    angles = a.angles
    if not angles:
        far = op & (r > R*1.35)
        h, _ = np.histogram(ang[far], bins=72, range=(0, 360))
        h = np.convolve(np.r_[h[-2:], h, h[:2]], np.ones(5)/5, 'same')[2:-2]
        angles = [i*5+2.5 for i in range(72) if h[i] > 0.25*h.max() and h[i] >= h[i-1] and h[i] >= h[(i+1) % 72]]
    angles = sorted(angles); n = len(angles)
    core = d.copy(); core[r > R] = 0
    frame(Image.fromarray(core), cx, cy, half).save(os.path.join(a.outdir, 'core.png'))
    legs = []
    for i, c in enumerate(angles):
        gap = min((angles[(i+1) % n]-c) % 360, (c-angles[i-1]) % 360) / 2
        sec = np.abs((ang - c + 180) % 360 - 180) <= gap
        leg = d.copy(); leg[~(sec & (r >= R-45))] = 0
        ring = sec & op & (r > R-10) & (r < R+35)
        if ring.any(): py, px = yy[ring].mean(), xx[ring].mean()
        else: py, px = cy+R*math.sin(math.radians(c)), cx+R*math.cos(math.radians(c))
        name = f"leg{i}"
        frame(Image.fromarray(leg), cx, cy, half).save(os.path.join(a.outdir, name + '.png'))
        legs.append({'n': name, 'angle': round(float(c), 1), 'px': round(float(px-(cx-half))*k, 2), 'py': round(float(py-(cy-half))*k, 2)})
    for j, l in enumerate(sorted(legs, key=lambda l: l['angle'])): l['g'] = 'A' if j % 2 == 0 else 'B'
    m.update({'core_radius_src': int(R), 'legs': legs}); wmeta(a.meta, m)
    print(f"core radius={R}  legs={[(l['n'], l['angle'], l['g']) for l in legs]}")

def cmd_preview(a):
    m = rmeta(a.meta); P = a.parts
    def pose(amp):
        t = Image.new('RGBA', (SIZE, SIZE), (42, 47, 40, 255))
        for l in m.get('legs', []):
            s = amp if l['g'] == 'A' else -amp; side = 1 if l['px'] > SIZE/2 else -1
            t.alpha_composite(load(os.path.join(P, l['n']+'.png')).rotate(side*s, center=(l['px'], l['py']), resample=Image.NEAREST))
        for f in ('core.png', 'body.png', 'turret.png'):
            if os.path.exists(os.path.join(P, f)): t.alpha_composite(load(os.path.join(P, f)))
        return t.resize((SIZE*3, SIZE*3), Image.NEAREST)
    poses = [pose(0)] + ([pose(14), pose(-14)] if m.get('legs') else [])
    out = Image.new('RGBA', (SIZE*3*len(poses), SIZE*3))
    for i, p in enumerate(poses): out.paste(p, (i*SIZE*3, 0))
    out.save(a.out); print(f"preview -> {a.out}")

def cmd_check(a):
    ok = True
    for p in sorted(glob.glob(os.path.join(a.dir, '*.png'))):
        im = load(p); good = im.size == (SIZE, SIZE); ok &= good
        print(f"{'OK ' if good else 'BAD'} {os.path.basename(p)} {im.size} content={im.getbbox()}")
    print(f'ALL {SIZE}x{SIZE}' if ok else 'SIZE PROBLEMS FOUND'); sys.exit(0 if ok else 1)

ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest='cmd', required=True)
p = sp.add_parser('inspect'); p.add_argument('imgs', nargs='+')
p = sp.add_parser('keyout'); p.add_argument('img'); p.add_argument('--out', required=True); p.add_argument('--color', choices=['white', 'magenta'], default='magenta')
p = sp.add_parser('body'); p.add_argument('img'); p.add_argument('--out', required=True); p.add_argument('--meta', required=True)
p.add_argument('--tiles', type=float, default=1.0)
p.add_argument('--center', nargs=2, type=int); p.add_argument('--half', type=int)
p = sp.add_parser('turret'); p.add_argument('img'); p.add_argument('--meta', required=True); p.add_argument('--out', required=True)
p.add_argument('--pivot', nargs=2, type=float, required=True); p.add_argument('--scale', type=float, default=1.0)
p = sp.add_parser('legs'); p.add_argument('img'); p.add_argument('--meta', required=True); p.add_argument('--outdir', required=True)
p.add_argument('--core-radius', type=int); p.add_argument('--angles', nargs='+', type=float)
p = sp.add_parser('preview'); p.add_argument('--meta', required=True); p.add_argument('--parts', required=True); p.add_argument('--out', required=True)
p = sp.add_parser('check'); p.add_argument('dir'); p.add_argument('--meta')
a = ap.parse_args()
if a.cmd == 'body': SIZE = round(TILE * a.tiles); SIZE += SIZE % 2
elif getattr(a, 'meta', None): SIZE = rmeta(a.meta).get('size', TILE)
globals()['cmd_'+a.cmd](a)
