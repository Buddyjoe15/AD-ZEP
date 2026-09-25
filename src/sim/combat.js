/* Target acquisition and direct-fire combat. Targets are searched only in the spatial
   hashes of opposing teams, so friendly crowds cost nothing and peaceful maps skip the
   whole pass. */
(function(){
  'use strict';
  const G = GW;

  function acquire(u, S){
    // Swarm units already pick a target every few ticks (src/sim/swarm.js); reuse it.
    if (u.aiMode && !u.aiHold){
      const t = typeof u.aiTargetId === 'number' ? G.Units.alive(u.aiTargetId) : null;
      return t && t.team !== u.team ? { t, d: Math.sqrt(G.dist2(u, t)) } : null;
    }
    if (u.targetId != null && S.time < u.targetNextScan){
      const t = G.Units.alive(u.targetId);
      if (t && t.team !== u.team){
        const d = Math.sqrt(G.dist2(u, t));
        if (d <= u.sight * 1.15) return { t, d };
      }
    }
    let best = null, bd = u.sight * u.sight;
    for (const [team, hash] of Object.entries(S.teamSpatial)){
      if (team === u.team || !hash.count) continue;
      const v = hash.nearest(u.x, u.y, u.sight);
      if (v){ const d = G.dist2(u, v); if (d <= bd){ bd = d; best = v; } }
    }
    u.targetId = best ? best.id : null;
    u.targetNextScan = S.time + 0.18 + (u.id % 7) * 0.015;
    return best ? { t: best, d: Math.sqrt(bd) } : null;
  }

  function fire(u, t, S){
    let dmg = u.damage;
    if (t.team === 'blue' && G.Cheats.god && typeof t.id === 'number') dmg = 0;   // godmode: friendly units (not structures)
    else if (t.isHero){
      const dr = G.Inventory.damageReduction();
      dmg *= 1 - dr;
      if (dr > 0) G.Inventory.wearArmor(Math.max(0.5, u.damage * 0.05));
    }
    const aura = G.Buildings.damageReduction(t);
    if (aura > 0) dmg *= 1 - aura;
    dmg *= 1 - G.Buildings.armor(t);   // structures such as Reinforced Walls resist damage
    t.hp -= dmg;
    u.cool = u.reload;
    S.shots.push({ x1: u.x, y1: u.y, x2: t.x, y2: t.y, life: 0.09, team: u.team });
    G.Events.emit('combat:hit', { attacker: u, target: t, damage: dmg });
  }

  G.SystemManager.register('combat', {
    update(dt){
      const S = G.State;
      // Nothing to fight unless at least two teams have living units.
      let teams = 0;
      for (const hash of Object.values(S.teamSpatial)) if (hash.count) teams++;
      for (const u of S.units){
        if (u.hp <= 0 || u.isShip || u.damage <= 0 || u.range <= 0) continue;
        u.cool -= dt;
        if (teams < 2 && typeof u.aiTargetId !== 'string'){ u.targetId = null; continue; }
        const q = acquire(u, S);
        if (q && q.d <= u.range){ if (u.cool <= 0) fire(u, q.t, S); }
        else if (u.cool <= 0 && typeof u.aiTargetId === 'string'){
          // No unit in range: shoot the structure the AI is engaging, once within range.
          const b = S.buildings.find(x => x.id === u.aiTargetId && x.hp > 0);
          if (b && G.Buildings.nearestTarget(u, u.range) === b) fire(u, b, S);
        }
      }
    }
  });

  G.SystemManager.register('cleanup', {
    update(dt){
      const S = G.State;
      if (S.shots.length){
        let w = 0;
        for (const s of S.shots){ s.life -= dt; if (s.life > 0) S.shots[w++] = s; }
        S.shots.length = w;
      }
      const dead = G.Units.sweep();
      for (const u of dead){
        if (u.buildSiteId) G.Construction.cancelFor(u, true);
        if (u.fabQueue && u.fabQueue.length) G.Fabrication.refundQueue(u);
      }
      G.Containers.sweep();
      S.metrics.entities = S.units.length;
    }
  });
})();
