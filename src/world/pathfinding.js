/* Navigation.
   - Pathfinder: A* over the tile grid with preallocated typed arrays (no per-search
     allocation), region checks that reject unreachable goals instantly, stand-in goals
     for blocked targets, partial paths when the node budget runs out, and line-of-sight
     smoothing.
   - FlowField: one Dijkstra field from a goal shared by a whole group, so moving a large
     selection costs one search instead of one per unit.
   - PathService: a request queue served under a per-tick time budget, so hundreds of
     units asking for routes at once never stall a frame. */
(function(){
  'use strict';
  const G = GW;
  const now = () => G.Clock.now();   // diagnostics only
  const SQRT2 = Math.SQRT2;
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];

  function neighbours(grid, i, fn){
    const cols = grid.cols, x = i % cols, y = (i / cols) | 0;
    for (let d = 0; d < 8; d++){
      const nx = x + DX[d], ny = y + DY[d];
      if (!grid.passable(nx, ny)) continue;
      const diag = d >= 4;
      if (diag && (!grid.passable(x + DX[d], y) || !grid.passable(x, y + DY[d]))) continue;
      fn(ny * cols + nx, diag ? SQRT2 : 1);
    }
  }

  function smooth(grid, sx, sy, pts, lookahead = 40){
    if (pts.length <= 1) return pts;
    const out = [];
    let ax = sx, ay = sy, i = 0;
    while (i < pts.length){
      let j = i;
      const limit = Math.min(pts.length - 1, i + lookahead);
      for (let k = i + 1; k <= limit; k++){
        if (grid.lineClear(ax, ay, pts[k].x, pts[k].y)) j = k; else break;
      }
      out.push(pts[j]); ax = pts[j].x; ay = pts[j].y; i = j + 1;
    }
    return out;
  }

  // Drops intermediate points on straight runs. Cheap; used where full line-of-sight
  // smoothing would be too costly (flow-field paths for large groups). Movement then
  // skips visible waypoints incrementally.
  function compress(pts){
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++){
      const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      if (Math.sign(b.x - a.x) !== Math.sign(c.x - b.x) || Math.sign(b.y - a.y) !== Math.sign(c.y - b.y)) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  class Pathfinder {
    constructor(grid){
      this.grid = grid;
      const n = grid.size;
      this.g = new Float32Array(n);
      this.parent = new Int32Array(n);
      this.seen = new Uint32Array(n);
      this.closed = new Uint32Array(n);
      this.gen = 0;
      this.heap = new G.IndexHeap(4096);
    }
    nextGen(){
      if (++this.gen >= 0xffffffff){ this.seen.fill(0); this.closed.fill(0); this.gen = 1; }
      return this.gen;
    }
    tileOf(wx, wy){
      const T = G.CONFIG.TILE, g = this.grid;
      return { x: G.clamp(Math.floor(wx / T), 0, g.cols - 1), y: G.clamp(Math.floor(wy / T), 0, g.rows - 1) };
    }
    // Start tile: the unit's own tile, or the nearest open tile if it stands on a blocked one.
    startTile(wx, wy){
      const t = this.tileOf(wx, wy);
      return this.grid.passable(t.x, t.y) ? t : this.grid.nearestOpen(t.x, t.y, 6);
    }
    // Goal tile: the target if reachable from `region`, otherwise the nearest reachable tile.
    goalTile(wx, wy, region){
      const t = this.tileOf(wx, wy), g = this.grid;
      if (g.passable(t.x, t.y) && g.regionAt(t.x, t.y) === region) return { ...t, exact: true };
      const alt = g.nearestOpen(t.x, t.y, G.CONFIG.PATH_RETARGET_RADIUS, region);
      return alt ? { ...alt, exact: false } : null;
    }
    // Returns an array of world-space waypoints (empty when no progress is possible).
    find(sx, sy, tx, ty, maxNodes = G.CONFIG.PATH_MAX_NODES){
      const t0 = now(), grid = this.grid, T = G.CONFIG.TILE, cols = grid.cols, M = G.State.metrics;
      this.lastExpanded = 0;
      const done = pts => { M.pathCalls++; M.pathMs += now() - t0; return pts; };
      const st = this.startTile(sx, sy);
      if (!st) return done([]);
      const region = grid.regionAt(st.x, st.y), gt = this.goalTile(tx, ty, region);
      if (!gt) return done([]);
      const goalX = gt.exact ? tx : (gt.x + 0.5) * T, goalY = gt.exact ? ty : (gt.y + 0.5) * T;
      const startOpen = grid.passableWorld(sx, sy);
      if (startOpen && grid.lineClear(sx, sy, goalX, goalY)) return done([{ x: goalX, y: goalY }]);

      const gen = this.nextGen(), g = this.g, parent = this.parent, seen = this.seen, closed = this.closed, heap = this.heap;
      const start = st.y * cols + st.x, goal = gt.y * cols + gt.x;
      const h = i => { const x = i % cols, y = (i / cols) | 0, dx = Math.abs(x - gt.x), dy = Math.abs(y - gt.y); return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy); };
      heap.clear();
      seen[start] = gen; g[start] = 0; parent[start] = -1; heap.push(start, h(start));
      let expanded = 0, best = start, bestH = h(start), reached = false;
      while (heap.length){
        const cur = heap.pop();
        if (closed[cur] === gen) continue;
        closed[cur] = gen;
        if (cur === goal){ reached = true; break; }
        const hc = h(cur);
        if (hc < bestH){ bestH = hc; best = cur; }
        if (++expanded > maxNodes) break;
        this.lastExpanded = expanded;
        const gc = g[cur];
        neighbours(grid, cur, (ni, step) => {
          if (closed[ni] === gen) return;
          const ng = gc + step * grid.moveCostIdx(ni);
          if (seen[ni] !== gen || ng < g[ni]){
            seen[ni] = gen; g[ni] = ng; parent[ni] = cur;
            heap.push(ni, ng + h(ni));
          }
        });
      }
      const end = reached ? goal : best;
      if (end === start && !reached) return done(startOpen ? [] : [{ x: (st.x + 0.5) * T, y: (st.y + 0.5) * T }]);
      const tiles = [];
      for (let cur = end, guard = 0; cur !== -1 && guard < grid.size; cur = parent[cur], guard++) tiles.push(cur);
      tiles.reverse();
      const pts = tiles.slice(1).map(i => ({ x: (i % cols + 0.5) * T, y: (((i / cols) | 0) + 0.5) * T }));
      if (!startOpen) pts.unshift({ x: (st.x + 0.5) * T, y: (st.y + 0.5) * T });
      if (reached){ if (pts.length) pts[pts.length - 1] = { x: goalX, y: goalY }; else pts.push({ x: goalX, y: goalY }); }
      return done(smooth(grid, sx, sy, pts));
    }
  }

  // Dijkstra field toward one goal, limited to a window of the map.
  class FlowField {
    constructor(grid, goalX, goalY, win){
      const T = G.CONFIG.TILE;
      this.grid = grid; this.win = win;
      this.goalX = goalX; this.goalY = goalY;
      this.gtx = Math.floor(goalX / T); this.gty = Math.floor(goalY / T);
      this.cost = new Float32Array(win.w * win.h).fill(Infinity);
      this.build();
    }
    local(x, y){ const w = this.win; return (x < w.x || y < w.y || x >= w.x + w.w || y >= w.y + w.h) ? -1 : (y - w.y) * w.w + (x - w.x); }
    build(){
      const grid = this.grid, cols = grid.cols, heap = new G.IndexHeap(4096), cost = this.cost;
      const gl = this.local(this.gtx, this.gty);
      if (gl < 0 || !grid.passable(this.gtx, this.gty)) return;
      cost[gl] = 0; heap.push(this.gty * cols + this.gtx, 0);
      while (heap.length){
        const key = heap.peekKey(), cur = heap.pop(), cl = this.local(cur % cols, (cur / cols) | 0);
        if (key > cost[cl]) continue;
        neighbours(grid, cur, (ni, step) => {
          const nl = this.local(ni % cols, (ni / cols) | 0);
          if (nl < 0) return;
          const nc = cost[cl] + step * grid.moveCostIdx(ni);
          if (nc < cost[nl]){ cost[nl] = nc; heap.push(ni, nc); }
        });
      }
    }
    // Waypoints from (wx, wy) down the field to the goal, or null if not covered.
    pathFrom(wx, wy){
      const T = G.CONFIG.TILE, grid = this.grid, cols = grid.cols;
      let x = Math.floor(wx / T), y = Math.floor(wy / T), l = this.local(x, y);
      if (l < 0 || !Number.isFinite(this.cost[l])) return null;
      const pts = [];
      for (let guard = 0; guard < this.win.w * this.win.h && this.cost[l] > 0; guard++){
        let bestI = -1, bestC = this.cost[l];
        neighbours(grid, y * cols + x, ni => {
          const nl = this.local(ni % cols, (ni / cols) | 0);
          if (nl >= 0 && this.cost[nl] < bestC){ bestC = this.cost[nl]; bestI = ni; }
        });
        if (bestI < 0) return null;
        x = bestI % cols; y = (bestI / cols) | 0; l = this.local(x, y);
        pts.push({ x: (x + 0.5) * T, y: (y + 0.5) * T });
      }
      if (pts.length) pts[pts.length - 1] = { x: this.goalX, y: this.goalY }; else pts.push({ x: this.goalX, y: this.goalY });
      return compress(pts);
    }
  }

  class PathService {
    constructor(grid){
      this.grid = grid;
      this.pathfinder = new Pathfinder(grid);
      this.queue = []; this.head = 0;
      this.pending = new Map();
    }
    // Synchronous search. Prefer request() for anything issued by AI every few seconds.
    find(sx, sy, tx, ty, maxNodes){ return this.pathfinder.find(sx, sy, tx, ty, maxNodes); }
    lineClear(sx, sy, tx, ty){ return this.grid.lineClear(sx, sy, tx, ty); }
    reachable(sx, sy, tx, ty){
      const pf = this.pathfinder, a = pf.startTile(sx, sy);
      if (!a) return false;
      const t = pf.tileOf(tx, ty);
      return this.grid.passable(t.x, t.y) && this.grid.reachable(a.x, a.y, t.x, t.y);
    }
    // Queue a route for `unit`. A newer request for the same unit replaces the older one.
    request(unit, x, y, opts = {}){
      const old = this.pending.get(unit.id);
      if (old) old.cancelled = true;
      const req = { unit, x, y, maxNodes: opts.maxNodes, onDone: opts.onDone, cancelled: false };
      this.pending.set(unit.id, req);
      unit.pathPending = true;
      if (opts.priority){ this.compact(); this.queue.unshift(req); }
      else this.queue.push(req);
      return req;
    }
    cancel(unit){
      const old = this.pending.get(unit.id);
      if (old){ old.cancelled = true; this.pending.delete(unit.id); }
      unit.pathPending = false;
    }
    compact(){ if (this.head){ this.queue = this.queue.slice(this.head); this.head = 0; } }
    get length(){ return this.queue.length - this.head; }
    // Serves queued requests until `nodeBudget` A* expansions or `maxCount` requests have
    // been spent this tick. The budget counts work, not time, so results are identical on
    // fast and slow machines (a determinism requirement for tests, replays and lockstep).
    process(nodeBudget = G.CONFIG.PATH_NODE_BUDGET, maxCount = G.CONFIG.PATH_MAX_PER_TICK){
      let served = 0, spent = 0;
      while (this.head < this.queue.length && served < maxCount){
        const req = this.queue[this.head++];
        if (req.cancelled) continue;
        this.pending.delete(req.unit.id);
        const u = req.unit;
        u.pathPending = false;
        if (u.hp <= 0) continue;
        const pts = this.pathfinder.find(u.x, u.y, req.x, req.y, req.maxNodes);
        u.path = pts; u.pathIndex = 0;
        if (req.onDone) req.onDone(pts);
        served++;
        spent += this.pathfinder.lastExpanded + 1;
        if (spent >= nodeBudget) break;
      }
      if (this.head > 256 && this.head * 2 > this.queue.length) this.compact();
      G.State.metrics.pathQueue = this.length;
      return served;
    }
    // Moves units to per-unit slots around a shared goal. Large groups share a flow field;
    // units it does not cover fall back to individual queued searches.
    groupMove(slots, goalX, goalY){
      if (!slots.length) return;
      const C = G.CONFIG;
      if (slots.length < C.FLOWFIELD_MIN_GROUP){
        for (const s of slots) this.assign(s.unit, this.find(s.unit.x, s.unit.y, s.x, s.y));
        return;
      }
      const T = C.TILE, grid = this.grid, M = C.FLOWFIELD_MARGIN;
      const goal = this.pathfinder.tileOf(goalX, goalY);
      const open = grid.nearestOpen(goal.x, goal.y, C.PATH_RETARGET_RADIUS);
      if (!open){ for (const s of slots) this.request(s.unit, s.x, s.y, { priority: true }); return; }
      let x0 = open.x, y0 = open.y, x1 = open.x, y1 = open.y;
      for (const s of slots){
        const tx = Math.floor(s.unit.x / T), ty = Math.floor(s.unit.y / T);
        x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty);
      }
      const win = { x: Math.max(0, x0 - M), y: Math.max(0, y0 - M) };
      win.w = Math.min(grid.cols, x1 + M + 1) - win.x; win.h = Math.min(grid.rows, y1 + M + 1) - win.y;
      // A widely scattered group would need a near-global field; queued searches are cheaper.
      if (win.w * win.h > 160000){ for (const s of slots) this.request(s.unit, s.x, s.y, { priority: true }); return; }
      const t0 = now(), field = new FlowField(grid, (open.x + 0.5) * T, (open.y + 0.5) * T, win);
      G.State.metrics.flowFields++; G.State.metrics.pathMs += now() - t0;
      for (const s of slots){
        const u = s.unit, route = field.pathFrom(u.x, u.y);
        if (!route){ this.request(u, s.x, s.y, { priority: true }); continue; }
        // Replace the shared goal with the unit's own slot when the final leg is clear.
        const prev = route.length > 1 ? route[route.length - 2] : u;
        if (grid.lineClear(prev.x, prev.y, s.x, s.y)) route[route.length - 1] = { x: s.x, y: s.y };
        else if (grid.passableWorld(s.x, s.y)){ this.assign(u, route); this.request(u, s.x, s.y); continue; }
        this.assign(u, route);
      }
    }
    assign(u, pts){ this.cancel(u); u.path = pts; u.pathIndex = 0; }
  }

  G.Pathfinder = Pathfinder;
  G.FlowField = FlowField;
  G.PathService = PathService;
})();
