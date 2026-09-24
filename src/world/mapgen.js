/* Seeded forest Earth generator. Output depends only on the seed and world size, so saves
   store the seed instead of the terrain. Keep the RNG call order stable: reordering any
   step changes every existing Earth. */
(function(){
  'use strict';
  const G = GW;
  const TT = { GRASS:0, PATH:1, WATER:2, ROCK:3, FOREST:4, TREE:5, BUSH:6, BRIDGE:7, FLOOR:8, WALL:9, DOOR:10, CLEARING:11 };
  G.TT = TT;

  function forest(seed){
    const C = G.CONFIG, cols = C.COLS, rows = C.ROWS;
    const grid = new G.Grid(cols, rows), r = G.RNG(seed), ruins = [];
    const set = (x, y, t) => grid.setRaw(x, y, t), get = (x, y) => grid.get(x, y);
    const paintDisc = (cx, cy, rad, t) => {
      for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++){
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        if (Math.hypot(x - cx, y - cy) <= rad) set(x, y, t);
      }
    };
    const paintPath = (points, width = 2, t = TT.PATH) => {
      for (let s = 0; s < points.length - 1; s++){
        const a = points[s], b = points[s + 1], steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 3;
        for (let i = 0; i <= steps; i++){
          const q = i / Math.max(1, steps);
          paintDisc(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q, width / 2, t);
        }
      }
    };
    const clearRect = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, TT.CLEARING); };
    // Ruined structures: enterable ones get a floor, walls and a south door.
    const addRuin = b => {
      ruins.push(b);
      for (let y = b.gy; y < b.gy + b.h; y++) for (let x = b.gx; x < b.gx + b.w; x++){
        const edge = x === b.gx || y === b.gy || x === b.gx + b.w - 1 || y === b.gy + b.h - 1;
        set(x, y, b.enterable && !edge ? TT.FLOOR : TT.WALL);
      }
      if (b.enterable) set(b.gx + Math.floor(b.w / 2), b.gy + b.h - 1, TT.DOOR);
    };
    const placeScatteredRuin = n => {
      const defs = [
        { w: 2, h: 2, enterable: false }, { w: 3, h: 3, enterable: false }, { w: 4, h: 4, enterable: true },
        { w: 4, h: 6, enterable: true }, { w: 6, h: 6, enterable: true }, { w: 6, h: 4, enterable: false }
      ];
      const d = defs[n % defs.length];
      for (let tries = 0; tries < 600; tries++){
        const gx = 8 + Math.floor(r() * (cols - d.w - 16)), gy = 8 + Math.floor(r() * (rows - d.h - 16));
        let bad = false;
        for (let y = gy - 2; y < gy + d.h + 2 && !bad; y++) for (let x = gx - 2; x < gx + d.w + 2; x++){
          const t = get(x, y); if (t === TT.WATER || t === TT.ROCK){ bad = true; break; }
        }
        if (bad) continue;
        for (const b of ruins) if (gx < b.gx + b.w + 4 && gx + d.w + 4 > b.gx && gy < b.gy + b.h + 4 && gy + d.h + 4 > b.gy){ bad = true; break; }
        if (bad) continue;
        clearRect(gx - 2, gy - 2, d.w + 4, d.h + 4);
        addRuin({ gx, gy, ...d });
        return;
      }
    };

    grid.tiles.fill(TT.GRASS);
    const areaScale = (cols * rows) / (256 * 256);

    // Forest floor patches.
    for (let n = 0; n < Math.round(74 * areaScale); n++){
      const cx = 6 + r() * (cols - 12), cy = 6 + r() * (rows - 12), rx = 3 + r() * 12, ry = 3 + r() * 10;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++){
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1 && r() < 0.88) set(x, y, TT.FOREST);
      }
    }
    // Trees on forest floor, scattered brush.
    for (let y = 2; y < rows - 2; y++) for (let x = 2; x < cols - 2; x++){
      const t = get(x, y);
      if (t === TT.FOREST && r() < 0.43) set(x, y, TT.TREE);
      else if ((t === TT.GRASS || t === TT.FOREST) && r() < 0.035) set(x, y, TT.BUSH);
    }
    // Central stream.
    const stream = [];
    for (let y = 0; y < rows; y++){
      const cx = Math.round(cols * 0.5 + 18 * Math.sin(y / 31) + 7 * Math.sin(y / 11));
      stream[y] = cx;
      const half = (y > rows * 0.55 && y < rows * 0.64) ? 3 : 2;
      for (let x = cx - half; x <= cx + half; x++) set(x, y, TT.WATER);
    }
    // Rock formations.
    for (let n = 0; n < Math.round(11 * areaScale); n++){
      const cx = 10 + r() * (cols - 20), cy = 10 + r() * (rows - 20), rr = 2 + r() * 5;
      paintDisc(cx, cy, rr, TT.ROCK);
    }
    // Major clearings.
    clearRect(8, 198, 58, 50); clearRect(188, 194, 62, 56); clearRect(88, 108, 24, 24); clearRect(151, 72, 18, 18);
    // Bridges.
    for (const by of [63, 136, 220, Math.round(rows * 0.62), Math.round(rows * 0.78), Math.round(rows * 0.91)]){
      const cx = stream[by];
      for (let y = by - 2; y <= by + 2; y++) for (let x = cx - 5; x <= cx + 5; x++) set(x, y, TT.BRIDGE);
    }
    // Footpaths and long arterial trails.
    paintPath([{x:25,y:226},{x:48,y:216},{x:78,y:205},{x:106,y:219},{x:129,y:220},{x:158,y:224},{x:195,y:222},{x:230,y:224}], 3);
    paintPath([{x:105,y:219},{x:99,y:176},{x:98,y:131},{x:124,y:136},{x:154,y:111},{x:160,y:81}], 2);
    paintPath([{x:99,y:131},{x:84,y:105},{x:61,y:83}], 2);
    paintPath([{x:154,y:111},{x:184,y:122},{x:212,y:142},{x:223,y:194}], 2);
    paintPath([{x:61,y:83},{x:89,y:62},{x:124,y:63},{x:158,y:55},{x:196,y:44}], 2);
    paintPath([{x:32,y:256},{x:128,y:258},{x:256,y:256},{x:384,y:252},{x:488,y:258}], 3);
    paintPath([{x:256,y:24},{x:255,y:128},{x:256,y:256},{x:260,y:384},{x:256,y:488}], 3);
    paintPath([{x:82,y:420},{x:180,y:395},{x:300,y:405},{x:420,y:424},{x:482,y:438}], 2);
    // Landmark ruins.
    for (const [gx, gy, w, h, enterable] of [
      [39,231,1,1,false],[43,229,2,2,false],[48,224,4,6,true],[55,224,6,6,true],[92,116,4,4,true],[157,77,4,4,true],
      [202,207,4,6,true],[212,203,6,6,true],[227,207,6,6,false],[200,222,4,4,true],[235,224,4,4,true]
    ]) addRuin({ gx, gy, w, h, enterable });
    // Far settlement ruins in the south-east.
    clearRect(396, 394, 92, 88);
    paintPath([{x:402,y:438},{x:440,y:438},{x:482,y:438}], 4);
    paintPath([{x:438,y:402},{x:438,y:438},{x:440,y:476}], 3);
    for (const [gx, gy, w, h, enterable] of [
      [405,408,4,6,true],[414,408,4,6,true],[426,405,6,6,true],[440,406,6,6,false],[454,410,4,4,true],[466,407,4,4,true],
      [405,449,6,6,true],[420,451,4,6,true],[438,452,6,4,false],[456,452,4,4,true],[470,456,4,4,true]
    ]) addRuin({ gx, gy, w, h, enterable });
    for (let n = 0; n < 72; n++) placeScatteredRuin(n);
    // Landing zone at the world centre is always clear.
    const mid = cols / 2;
    clearRect(mid - 16, mid - 12, 32, 30);

    grid.touch();
    grid.stream = stream;
    return grid;
  }

  G.MapGen = { forest };
})();
