/* Expedition rules: signals to study, drive repair and stabilisation, hostile waves,
   climate hazards, recall, the departure checklist and transit to the next Earth.
   Balance values come from GW.EXPEDITION_RULES (src/data/world.js). */
(function(){
  'use strict';
  const G = GW;
  const R = () => G.EXPEDITION_RULES;
  const INTRO_LOG = [
    'ARIA: Dimensional displacement confirmed. EARTH ZERO PROTOCOL ACTIVATED.',
    'Vance: You knew this could happen?',
    'ARIA: The contingency was classified. My disclosure restrictions remain in force.'
  ];

  G.Expedition = {
    get state(){ return G.State.expedition; },
    fresh(){
      return {
        world: 1, climate: 0, readiness: R().readiness, repairs: 0, elementP: 0, upgrades: 0,
        elapsed: 0, auto: 0, scans: 0, built: 0, waveAt: R().firstWave,
        log: [...INTRO_LOG], sites: [], history: [], progress: { delivered: 0, built: 0 }, lastReport: null
      };
    },
    climate(E = this.state){ const all = G.Defs.climates.all(); return all[E.climate % all.length]; },
    log(text){
      const E = this.state;
      if (E){ E.log.unshift(text); E.log.length = Math.min(E.log.length, 16); }
      G.notify(text);
      G.Events.emit('expedition:log', text);
    },
    earthLabel(n = this.state.world, pad = 4){ return 'EARTH-' + String(n).padStart(pad, '0'); },

    // Terrain edits are recorded so a restored save rebuilds the same ground.
    editTerrain(x, y, w, h, t = G.TT.CLEARING){
      const S = G.State;
      S.grid.fill(x, y, w, h, t);
      (S.terrainEdits || (S.terrainEdits = [])).push({ x, y, w, h, t });
      G.Events.emit('terrain:changed', { x, y, w, h });
    },

    // Signals, deposits and the testing zone for a freshly generated Earth.
    populate(){
      const S = G.State, E = this.state, sh = G.Units.ship(), rules = R(), T = G.CONFIG.TILE;
      S.resourceNodes = [];
      this.editTerrain(sh.gx - 13, sh.gy - 5, 32, 28);
      this.testingZone();
      const region = S.grid.regionAt(sh.gx + 3, sh.gy + sh.h);
      // Signals are pushed outward until no structure already covers them, so nothing
      // (e.g. the testing-zone Sensor Station) studies them for free.
      const covered = p => S.buildings.some(b => (G.Defs.buildables.get(b.type)?.behaviors || [])
        .some(beh => beh.type === 'studySignals' && G.within(b, p, beh.radiusTiles * T + 60)));
      E.sites = [];
      for (let i = 0; i < rules.signalCount; i++){
        const a = i * 2.399;
        let p = null;
        for (let d = 360 + i * 125, tries = 0; tries < 8; d += 160, tries++){
          p = G.openPoint(sh.x + Math.cos(a) * d, sh.y + 310 + Math.sin(a) * d, region);
          if (!covered(p)) break;
        }
        E.sites.push({ id: 'signal-' + i, x: p.x, y: p.y, kind: 'Archive', done: false, progress: 0 });
      }
      for (const [dx, dy] of [[-430, 390], [470, 430]]){
        const p = G.openPoint(sh.x + dx, sh.y + dy, region);
        G.Gather.addNode('scrap_mine', p.x, p.y);
      }
      for (const [dx, dy] of rules.metalMines){
        const site = this.mineSite(sh.x + dx, sh.y + dy, region);
        if (site) G.Gather.addNode('metal_mine', (site.x + 0.5) * T, (site.y + 0.5) * T);
      }
      E.waveAt = rules.firstWave;
    },
    // Tile near (wx, wy) where a deposit can take a 3×3 Mine Building: the whole block is
    // open, reachable ground away from other deposits.
    mineSite(wx, wy, region){
      const S = G.State, T = G.CONFIG.TILE, cx = Math.floor(wx / T), cy = Math.floor(wy / T);
      const ok = (x, y) => {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
          if (!S.grid.passable(x + dx, y + dy) || (region && S.grid.regionAt(x + dx, y + dy) !== region)) return false;
        }
        return !S.resourceNodes.some(n => Math.abs((n.gx ?? Math.floor(n.x / T)) - x) < 5 && Math.abs((n.gy ?? Math.floor(n.y / T)) - y) < 5);
      };
      for (let r = 0; r <= 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && ok(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
      }
      return null;
    },
    // One of every buildable and item, left of the ship, for testing, plus a metal deposit
    // with a working Mine Building beneath the grid.
    testingZone(){
      const S = G.State, sh = G.Units.ship(), T = G.CONFIG.TILE;
      const entries = [
        ...G.Defs.buildables.all().filter(d => !d.placeOnNode).map(d => ({ kind: 'building', key: d.key })),
        ...G.Defs.items.keys().map(key => ({ kind: 'item', key }))
      ];
      const cols = 4, x0 = sh.gx - 16, y0 = sh.gy + 1, rows = Math.ceil(entries.length / cols);
      this.editTerrain(x0 - 1, y0 - 2, cols * 3 + 1, rows * 3 + 6);
      entries.forEach((e, i) => {
        const gx = x0 + (i % cols) * 3, gy = y0 + Math.floor(i / cols) * 3, x = (gx + 0.5) * T, y = (gy + 0.5) * T;
        if (e.kind === 'item'){ G.Containers.groundItem(x, y, G.Items.create(e.key), { gx, gy, testZone: true }); return; }
        const d = G.Defs.buildables.get(e.key);
        if (d.container){ G.Containers.create(x, y, [], { opened: true, built: true, gx, gy, capacity: d.container.capacity, name: 'Test ' + d.name, testZone: true }); return; }
        G.Buildings.add(e.key, gx, gy, { id: 'test-' + G.newId(), extra: { testZone: true } });
      });
      for (const d of G.Defs.buildables.all().filter(d => d.placeOnNode === 'deposit')){
        const node = G.Defs.nodes.all().find(n => n.kind === 'deposit' && n.building === d.key);
        if (!node) continue;
        const gx = x0, gy = y0 + rows * 3;
        G.Gather.addNode(node.key, (gx + Math.floor(d.w / 2) + 0.5) * T, (gy + Math.floor(d.h / 2) + 0.5) * T);
        G.Buildings.add(d.key, gx, gy, { id: 'test-' + G.newId(), extra: { testZone: true } });
        break;
      }
    },

    departure(){
      const S = G.State, E = this.state, sh = G.Units.ship(), h = G.Units.hero(), rules = R();
      const crew = G.Units.crew();
      const away = sh ? crew.filter(u => Math.hypot(u.x - sh.x, u.y - sh.y) > rules.crewRadius) : crew;
      const cargo = crew.reduce((n, u) => n + G.Units.cargoTotal(u), 0), queued = G.Fabrication.totalQueued(), reasons = [];
      if (!h || !sh) reasons.push('Vance and the ship must survive');
      if (E.repairs < 100) reasons.push('Repair the drive · ' + rules.repairCost + ' metal');
      if (E.readiness > 0) reasons.push('Stabilization · ' + Math.ceil(E.readiness) + 's remaining');
      if (away.length) reasons.push('Return to ship · ' + away.length + ' crew away');
      if (cargo > 0.01) reasons.push('Recall to unload · ' + Math.ceil(cargo) + ' metal aboard drones');
      if (queued) reasons.push('Finish fabrication · ' + queued + ' queued');
      if (S.constructionSites.length) reasons.push('Finish construction or recall to cancel and refund');
      return { ready: !reasons.length, reasons, away: away.length, crew: crew.length, cargo };
    },

    recall(){
      const sh = G.Units.ship();
      if (!sh) return;
      G.Events.emit('build:cancel');
      // Individual orders keep one blocked unit from stranding the rest of the crew.
      G.Units.crew().forEach((u, i) => {
        const p = G.openPoint(sh.x - 175 + (i % 7) * 55, sh.y + 280 + Math.floor(i / 7) * 55);
        G.Orders.move([u], p.x, p.y);
        u.recallPoint = p;
      });
      this.log('ARIA: Return ordered. Drone cargo unloads at the ship. Unfinished field construction is refunded.');
    },

    // Player actions from the expedition log and fabrication panels.
    action(name, arg){
      const S = G.State, E = this.state, rules = R();
      if (!E || S.gameOver) return false;
      if (S.paused){ G.notify('Resume the expedition to issue orders'); return false; }
      switch (name){
        case 'explore': {
          const u = G.Units.hero(), p = E.sites.find(p => !p.done);
          if (!u || !p) return false;
          G.Orders.move([u], p.x, p.y);
          const guard = S.units.find(v => v.team === 'blue' && v.hp > 0 && !v.isHero && G.Units.can(v, 'fight'));
          if (guard) G.Orders.setCommand([guard], 'follow', null, u.id);
          S.selected = new Set([u.id]);
          this.log('ARIA: Vance en route to the next signal. Security escort assigned.');
          return true;
        }
        case 'survey': {
          const u = S.units.find(v => v.team === 'blue' && v.hp > 0 && !v.isHero && G.Units.can(v, 'survey')) || G.Units.hero(), p = E.sites.find(p => !p.done);
          if (!p){ G.notify('All local signals analyzed'); return false; }
          G.Orders.move([u], p.x, p.y);
          return true;
        }
        case 'mine': {
          // Quick salvage first while any is left, then the nearest Mine Building.
          const u = S.units.find(v => v.team === 'blue' && v.hp > 0 && G.Units.can(v, 'gather'));
          const nearest = list => list.reduce((best, t) => !best || G.dist2(u, t) < G.dist2(u, best) ? t : best, null);
          const target = u && (nearest(S.resourceNodes.filter(n => !G.Gather.isDeposit(n) && n.remaining > 0)) ||
            nearest(S.buildings.filter(b => b.team === 'blue' && b.hp > 0 && G.Gather.isMine(b))));
          if (!u || !target){ G.notify('A Utility Spider and a scavenge site or Mine Building are required'); return false; }
          G.Events.emit('build:cancel');
          return G.Gather.command(u, target);
        }
        case 'fabricate': {
          const owner = (arg && arg.ownerId != null) ? (G.Units.alive(arg.ownerId) || G.Buildings.get(arg.ownerId)) : G.Units.ship();
          return G.Fabrication.enqueue(owner, typeof arg === 'string' ? arg : arg && arg.recipe);
        }
        case 'repair':
          if (E.repairs >= 100) return false;
          if (!G.Economy.spend({ metal: rules.repairCost }, 'drive repair')){ G.notify('Insufficient metal'); return false; }
          E.repairs = 100;
          this.log('ARIA: Drive repairs complete. Stabilization continues.');
          return true;
        case 'boost':
          if (E.elementP < 1 || E.readiness <= 0){ G.notify('Requires contained Element P and an unfinished timer'); return false; }
          E.elementP--; E.readiness = Math.max(0, E.readiness - rules.boostSeconds);
          this.log('ARIA: Element P resonance consumed. Stabilization accelerated. Mechanism unresolved.');
          return true;
        case 'upgrade': {
          if (E.upgrades >= rules.upgradeMax) return false;
          if (!G.Economy.spend({ metal: rules.upgradeCost }, 'frame upgrade')){ G.notify('Insufficient metal'); return false; }
          E.upgrades++;
          const h = G.Units.hero();
          if (h){ h.maxHp += rules.upgradeHp; h.hp += rules.upgradeHp; }
          this.log('ARIA: Frame plating and resonance control upgraded.');
          return true;
        }
        case 'recall': this.recall(); return true;
        case 'transit': return this.transit();
      }
      return false;
    },

    update(dt){
      const S = G.State, E = this.state, rules = R();
      if (!E || S.gameOver) return;
      E.elapsed += dt; E.auto += dt;
      E.readiness = Math.max(0, E.readiness - dt);
      const sh = G.Units.ship(), h = G.Units.hero();
      if (!sh || !h) return;
      this.studySignals(dt);
      const climate = this.climate();
      if (climate.hazard && Math.hypot(h.x - sh.x, h.y - sh.y) > rules.hazardSafeRadius) h.hp -= climate.hazard * dt;
      if (climate.hostiles && E.elapsed >= E.waveAt){
        E.waveAt += rules.waveInterval;
        const n = Math.min(rules.waveMax, rules.waveBase + E.world);
        for (let i = 0; i < n; i++){ const p = G.openPoint(sh.x - 650 + i * 90, sh.y + 1050); G.Units.spawn('hostile_machine', p.x, p.y); }
        this.log('ARIA: Hostile machine signatures south of the landing zone.');
      }
      for (const u of S.units){
        if (!u.recallPoint || u.team !== 'blue' || u.hp <= 0) continue;
        if (u.command !== 'idle'){ u.recallPoint = null; continue; }
        if (Math.hypot(u.x - sh.x, u.y - sh.y) <= rules.crewRadius){
          if (G.Units.cargoTotal(u) > 0) G.Gather.unload(u);
          u.recallPoint = null;
        } else if (G.Units.navIdle(u) && S.time >= (u.recallRetry || 0)){
          const p = u.recallPoint;
          u.recallRetry = S.time + 2;
          G.Orders.move([u], p.x, p.y);
          u.recallPoint = p;
        }
      }
      if (E.auto >= G.CONFIG.AUTOSAVE_SECONDS){ E.auto = 0; G.Events.emit('expedition:autosave'); }
    },
    // Signals progress while a surveyor stands nearby or a sensor structure covers them.
    studySignals(dt){
      const S = G.State, E = this.state, rules = R(), T = G.CONFIG.TILE;
      const sensors = [];
      for (const b of S.buildings){
        if (b.hp <= 0 || b.team !== 'blue') continue;
        for (const beh of G.Defs.buildables.get(b.type)?.behaviors || []) if (beh.type === 'studySignals') sensors.push({ b, r: beh.radiusTiles * T });
      }
      for (const p of E.sites){
        if (p.done || (p.kind === 'Element P' && E.elementP >= rules.elementPMax)) continue;
        let near = sensors.some(s => G.within(s.b, p, s.r));
        if (!near){
          const list = S.teamSpatial?.blue ? S.teamSpatial.blue.query(p.x, p.y, rules.signalRange) : S.units;
          near = list.some(u => u.team === 'blue' && u.hp > 0 && G.Units.can(u, 'survey') && G.within(u, p, rules.signalRange));
        }
        if (!near) continue;
        p.progress += dt;
        if (p.progress < rules.signalStudySeconds) continue;
        p.done = true; E.scans++;
        if (p.kind === 'Element P'){
          if (E.elementP < rules.elementPMax){ E.elementP++; this.log('ARIA: Element P secured in containment.'); }
          else { p.done = false; p.progress = 0; this.log('ARIA: Containment full. Sample left in place.'); }
        } else {
          for (const [k, v] of Object.entries(rules.archiveReward)) G.Economy.add(k, v, 'archive');
          this.log('ARIA: Divergent historical archive recovered. Usable components: ' + G.Economy.describe(rules.archiveReward) + '.');
        }
      }
    },

    transit(){
      const S = G.State, d = this.departure();
      if (S.gameOver) return false;
      if (!d.ready){ this.log('ARIA: ' + d.reasons.join(' / ')); return false; }
      const snapshot = G.Save.serialize(), slot = S.activeSaveSlot;
      try {
        const prior = G.copy(S.expedition), rules = R();
        const crew = G.copy(G.Units.friendly()), inventory = G.copy(S.inventory);
        const carried = {}, left = {};
        for (const [k, v] of Object.entries(S.resources)){
          const cap = G.Defs.resources.get(k)?.transitCap ?? Infinity;
          carried[k] = Math.min(cap, v); left[k] = Math.max(0, v - carried[k]);
        }
        const report = {
          world: prior.world, seed: S.seed, seconds: prior.elapsed, metal: Math.floor(prior.progress.delivered),
          discoveries: prior.scans, built: prior.progress.built, crew: crew.filter(u => !u.isShip).length - 1,
          retainedMetal: Math.floor(carried.metal || 0), leftMetal: Math.floor(left.metal || 0)
        };
        prior.history.push({ world: prior.world, seed: S.seed, name: this.climate(prior).name });
        const time = S.time, nextId = S.nextId, seed = G.nextSeed(S.seed);

        G.Scenario.createWorld(seed, { slot });
        S.time = time;
        S.nextId = nextId + 100;
        const T = G.CONFIG.TILE, C = G.CONFIG;
        const shipData = crew.find(u => u.isShip);
        shipData.x = C.WORLD_W / 2; shipData.y = C.WORLD_H / 2;
        shipData.gx = Math.round(shipData.x / T - shipData.w / 2); shipData.gy = Math.round(shipData.y / T - shipData.h / 2);
        shipData.fabQueue = [];
        G.Units.adopt(shipData);
        S.shipId = shipData.id;
        const E = prior;
        E.world++; E.climate = (E.world - 1) % G.Defs.climates.size;
        E.readiness = Math.max(rules.readinessMin, rules.readiness - E.upgrades * rules.readinessPerUpgrade);
        E.elapsed = 0; E.auto = 0; E.scans = 0; E.progress = { delivered: 0, built: 0 }; E.lastReport = report;
        S.expedition = E;
        crew.filter(u => !u.isShip).forEach((u, i) => {
          const p = G.openPoint(shipData.x - 210 + (i % 7) * 64, shipData.y + 282 + Math.floor(i / 7) * 65);
          Object.assign(u, p, {
            path: [], pathIndex: 0, pathPending: false, command: 'idle', targetId: null, guardPoint: null,
            patrolA: null, patrolB: null, recallPoint: null, commandNextPath: 0, aiNextPath: 0, squad: null
          });
          if (u.cargo){ u.cargo = {}; u.haulState = 'idle'; u.nodeId = null; }
          if ('buildSiteId' in u) u.buildSiteId = null;
          G.Units.adopt(u);
        });
        S.heroId = crew.find(u => u.isHero).id;
        S.resources = carried;
        S.inventory = inventory;
        S.selected = new Set([S.heroId]); S.selectionAnchorId = S.heroId;
        this.populate();
        G.rebuildSpatial();
        G.Save.validate(G.Save.serialize());
        this.log('ARIA: Arrival at ' + this.earthLabel() + '. ' + this.climate().name + '. Crew and ship state retained.');
        G.Events.emit('expedition:transit', report);
        return true;
      } catch (err){
        console.error(err);
        G.Save.restore(snapshot, slot);
        this.log('ARIA: Transit aborted. Expedition restored: ' + err.message);
        return false;
      }
    }
  };

  G.Events.on('cargo:delivered', ({ amount }) => { const E = G.State.expedition; if (E) E.progress.delivered = G.round6(E.progress.delivered + amount); });
  G.Events.on('construction:completed', () => { const E = G.State.expedition; if (E){ E.built++; E.progress.built++; } });
  G.Events.on('fabrication:completed', ({ unit, owner }) => {
    if (G.State.expedition) G.Expedition.log('ARIA: ' + unit.name + ' deployed' + (owner.isShip ? '.' : ' from Fabricator.'));
  });

  G.Behaviors.register('studySignals', {});   // read by studySignals() above

  G.SystemManager.register('expedition', { update(dt){ G.Expedition.update(dt); } });
})();
