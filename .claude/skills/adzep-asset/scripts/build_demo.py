#!/usr/bin/env python3
"""Build a self-contained animation demo page for one AD-ZEP unit.

usage: build_demo.py --parts DIR --meta meta.json --unit unit.json --out demo.html

DIR holds body.png (or core.png when the unit has legs), optional turret.png and
leg*.png, all the same square size (192x192 for a 1-tile unit, 384x384 for 2x2). meta.json comes from process.py (leg pivots). unit.json
holds the behaviour settings; any key left out uses the default below.
"""
import argparse, base64, json, os

DEFAULTS = {
    "name": "Unit", "move": "legs", "speed": 55, "turnRate": 2.5, "turretRate": 5,
    "weapon": "bullets", "fireInterval": 0.07, "range": 420,
    "muzzles": [[0, -68]], "exhausts": [], "swing": 0.24, "stride": 9,
    "beam": "pulse", "dps": 12, "idleLift": 0, "idlePeriod": 1.8,
}
HERE = os.path.dirname(os.path.abspath(__file__))

def uri(p): return 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()

ap = argparse.ArgumentParser()
ap.add_argument('--parts', required=True); ap.add_argument('--meta', required=True)
ap.add_argument('--unit', required=True); ap.add_argument('--out', required=True)
a = ap.parse_args()
meta = json.load(open(a.meta)); unit = {**DEFAULTS, **json.load(open(a.unit))}
P = lambda f: os.path.join(a.parts, f)
body = P('core.png') if os.path.exists(P('core.png')) else P('body.png')
unit['size'] = meta.get('size', 192)
unit['body'] = uri(body)
unit['turret'] = uri(P('turret.png')) if os.path.exists(P('turret.png')) else None
unit['legs'] = [{'img': uri(P(l['n'] + '.png')), 'px': l['px'], 'py': l['py'], 'g': l['g']}
                for l in meta.get('legs', [])] if unit['move'] == 'legs' else []
tpl = open(os.path.join(HERE, '..', 'assets', 'demo_template.html')).read()
html = tpl.replace('/*UNIT*/null', json.dumps(unit)).replace('__TITLE__', unit['name'] + ' — animation test')
open(a.out, 'w').write(html)
print(f"demo -> {a.out}  ({len(html)//1024} KB, legs={len(unit['legs'])}, turret={bool(unit['turret'])})")
