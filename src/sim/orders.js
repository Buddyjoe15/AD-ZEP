/* Player orders (move, formations, follow / guard / patrol) and unit AI.
   AI re-plans through the queued PathService so large armies spread their searches
   over several ticks instead of stalling one. */
(function(){
  'use strict';
  const G = GW;

  G.Formations = {
    types: [...G.FORMATIONS],
    spacing: 46,
    offsets(type, n, space = this.spacing){
      if (n <= 0) return [];
      let out = [];
      if (type === 'line'){
        for (let i = 0; i < n; i++) out.push({ x: (i - (n - 1) / 2) * space, y: 0 });
      } else if (type === 'circle'){
        if (n === 1) return [{ x: 0, y: 0 }];
        const r = Math.max(space, n * space / (2 * Math.PI));
        for (let i = 0; i < n; i++){ const a = -Math.PI / 2 + i * Math.PI * 2 / n; out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); }
      } else if (type === 'v'){
        out.push({ x: 0, y: 0 });
        for (let i = 1; i < n; i++){ const rank = Math.ceil(i / 2), side = i % 2 === 1 ? -1 : 1; out.push({ x: side * rank * space * 0.72, y: rank * space * 0.72 }); }
        const cx = out.reduce((a, p) => a + p.x, 0) / n, cy = out.reduce((a, p) => a + p.y, 0) / n;
        out = out.map(p => ({ x: p.x - cx, y: p.y - cy }));
      } else {
        const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
        for (let i = 0; i < n; i++){ const col = i % cols, row = Math.floor(i / cols); out.push({ x: (col - (cols - 1) / 2) * space, y: (row - (rows - 1) / 2) * space }); }
      }
      return out;
    },
    rotate(offsets, angle){
      const c = Math.cos(angle || 0), s = Math.sin(angle || 0);
      return offsets.map(p => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
    },
    // Slot assignment keeps selection order stable so units do not swap sides every order.
    slots(units, type, ax, ay, angle = 0){
      const C = G.CONFIG, offsets = this.rotate(this.offsets(type, units.length), angle);
      const rank = new Map([...G.State.selected].map((id, i) => [id, i]));
      const sorted = [...units].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
      return sorted.map((u, i) => {
        const off = offsets[i] || { x: 0, y: 0 };
        return { unit: u, x: G.clamp(ax + off.x, 10, C.WORLD_W - 10), y: G.clamp(ay + off.y, 10, C.WORLD_H - 10) };
      });
    }
  };

  const movable = units => units.filter(u => u.hp > 0 && u.speed > 0);

  G.Orders = {
    // Formation move toward (x, y). Clears previous jobs (construction is refunded).
    move(units, x, y, angle = null){
      units = movable(units);
      if (!units.length) return;
      const S = G.State, a = angle == null ? (S.formationAngle || 0) : angle;
      const slots = G.Formations.slots(units, S.formation || 'square', x, y, a);
      for (const s of slots) G.Units.clearOrders(s.unit);
      S.paths.groupMove(slots, x, y);
      S.formationAngle = a;
      G.Events.emit('orders:issued', { kind: 'move', units });
    },
    arrange(units, type, x, y, angle = 0){
      units = movable(units);
      if (units.length < 2) return;
      const slots = G.Formations.slots(units, type, x, y, angle);
      for (const s of slots) G.Units.clearOrders(s.unit);
      G.State.paths.groupMove(slots, x, y);
    },
    // Standing orders. follow (any friendly unit, including Vance, may follow any other
    // friendly unit given by `targetId`) | guard | patrol (crew only) | idle.
    setCommand(units, cmd, point = null, targetId = null){
      const target = cmd === 'follow' ? G.Units.alive(targetId) : null;
      if (cmd === 'follow' && (!target || target.team !== 'blue')) return [];
      const crew = units.filter(u => u.team === 'blue' && !u.isShip && u.speed > 0 &&
        (cmd === 'follow' ? u.id !== target.id : cmd === 'idle' || !u.isHero));
      for (const u of crew){
        const hadSite = !!u.buildSiteId;
        G.Units.clearOrders(u);
        if (hadSite) G.notify('Construction cancelled — resources refunded');
        u.command = cmd;
        if (cmd === 'guard') u.guardPoint = point ? { x: point.x, y: point.y } : { x: u.x, y: u.y };
        else if (cmd === 'patrol'){ u.patrolA = { x: u.x, y: u.y }; u.patrolB = point ? { x: point.x, y: point.y } : { x: u.x + 180, y: u.y }; u.patrolTarget = 1; }
        else if (cmd === 'follow') u.followId = target.id;
      }
      G.Events.emit('orders:issued', { kind: cmd, units: crew });
      return crew;
    }
  };

  function replan(u, x, y, delay){
    const S = G.State;
    u.commandNextPath = S.time + delay + (u.id % 5) * 0.08;
    S.paths.request(u, x, y, { maxNodes: 6000 });
  }

  function crewBrain(u){
    const S = G.State;
    if (u.command === 'follow'){
      // Saves from before per-unit following have no followId: they followed Vance.
      const t = G.Units.alive(u.followId != null ? u.followId : S.heroId);
      if (!t || t.team !== u.team || t.id === u.id){ u.command = 'idle'; u.followId = null; u.path = []; u.pathIndex = 0; return; }
      if (S.time < u.commandNextPath) return;
      const near = t.radius + u.radius + 40, d = Math.hypot(u.x - t.x, u.y - t.y);
      if (d > near + 60) replan(u, t.x, t.y, 0.8);
      else if (d < near && u.path.length){ u.path = []; u.pathIndex = 0; }
    } else if (u.command === 'guard' && u.guardPoint){
      if (S.time < u.commandNextPath) return;
      if (Math.hypot(u.x - u.guardPoint.x, u.y - u.guardPoint.y) > 55) replan(u, u.guardPoint.x, u.guardPoint.y, 1.2);
    } else if (u.command === 'patrol' && u.patrolA && u.patrolB){
      let target = u.patrolTarget ? u.patrolB : u.patrolA;
      if (Math.hypot(u.x - target.x, u.y - target.y) < 45){ u.patrolTarget = u.patrolTarget ? 0 : 1; target = u.patrolTarget ? u.patrolB : u.patrolA; }
      if (G.Units.navIdle(u) && S.time >= u.commandNextPath) replan(u, target.x, target.y, 0.9);
    }
  }

  // Hostile hunters head for the nearest friendly unit, re-planning every ~1.4 s.
  const AI = {
    hunter(u){
      const S = G.State;
      if (u.aiHold || !G.Units.navIdle(u) || S.time < u.aiNextPath) return;
      u.aiNextPath = S.time + 1.35 + (u.id % 8) * 0.11;
      let best = null, bd = Infinity;
      // Local search first; the full scan only runs when nothing is within 2000 px.
      for (const [team, hash] of Object.entries(S.teamSpatial)){
        if (team === u.team) continue;
        const v = hash.nearest(u.x, u.y, 2000);
        if (v && G.dist2(u, v) < bd){ bd = G.dist2(u, v); best = v; }
      }
      if (!best) for (const v of S.units){
        if (v.team === u.team || v.hp <= 0) continue;
        const d = G.dist2(u, v);
        if (d < bd){ bd = d; best = v; }
      }
      if (best) S.paths.request(u, best.x, best.y, { maxNodes: 4000 });
    }
  };
  G.AI = AI;

  G.SystemManager.register('commands', {
    update(){
      for (const u of G.State.units){
        if (u.hp <= 0 || u.isShip) continue;
        const ai = G.Defs.units.get(u.type)?.ai;
        if (ai && AI[ai]) AI[ai](u);
        else if (u.team === 'blue' && (!u.isHero || u.command === 'follow')) crewBrain(u);
      }
    }
  });
  G.SystemManager.register('paths', { update(){ G.State.paths.process(); } });
})();
