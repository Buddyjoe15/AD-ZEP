/* World creation, new games, defeat rules and the fixed-step simulation entry point. */
(function(){
  'use strict';
  const G = GW;

  G.Scenario = {
    // Empty world for `seed`: terrain, spatial indexes and navigation, no entities.
    // `landing` ({x, y} tiles) is where the ship comes down; the centre when not given. A
    // generator may move it (Woodlands keeps it off water); S.landing is where it ended up.
    createWorld(seed, { slot, map, landing } = {}){
      const prevSlot = G.State.activeSaveSlot, prevMap = G.State.map;
      map = map || prevMap || G.MapGen.DEFAULT;
      if (!G.MapGen.types[map]) throw new Error('Unknown map type ' + map);
      const S = G.resetState();
      G.setWorldSize(G.CONFIG.WORLD_TILES);
      S.seed = seed >>> 0;
      S.activeSaveSlot = slot || prevSlot || 1;
      S.map = map;
      const want = G.MapGen.landing(landing);
      S.grid = G.MapGen.types[map].generate(S.seed, { landing: want });
      S.landing = S.grid.art && S.grid.art.landing ? { x: S.grid.art.landing.x, y: S.grid.art.landing.y } : want;
      S.terrainEdits = [];
      S.spatial = new G.DenseGrid(G.CONFIG.WORLD_W, G.CONFIG.WORLD_H, G.CONFIG.SPATIAL_CELL);
      S.teamSpatial = { blue: G.teamGrid(), red: G.teamGrid() };
      S.paths = new G.PathService(S.grid);
      G.Units.rebuildIndex();
      G.SystemManager.resetAll();
      G.Events.emit('world:created', S);
      return S;
    },
    newGame({ seed = 72491, slot = 1, map = G.MapGen.DEFAULT, landing = null } = {}){
      const S = this.createWorld(seed, { slot, map, landing }), C = G.CONFIG, rules = G.EXPEDITION_RULES;
      const cx = S.landing.x * C.TILE, cy = S.landing.y * C.TILE;
      const ship = G.Units.spawn('ship', cx, cy);
      ship.isShip = true; S.shipId = ship.id;
      const hero = G.Units.spawn('hero', cx, cy + C.TILE * 3 + 18);
      hero.isHero = true; S.heroId = hero.id;
      rules.startingCrew.forEach((type, i) => G.Units.spawn(type, cx - 160 + i * 70, cy + 260));
      S.startingCrewIds = G.Units.crew().map(u => u.id);
      S.resources = { metal: rules.startMetal };
      S.inventory.items.push(G.Items.create('simple_backpack'));
      S.expedition = G.Expedition.fresh();
      G.Expedition.populate();
      S.selected = new Set([hero.id]); S.selectionAnchorId = hero.id;
      G.rebuildSpatial();
      G.Events.emit('game:started', S);
      return S;
    },
    // The crew walks down the ramp into a staging formation after landing.
    disembark(){
      const S = G.State, ship = G.Units.ship();
      if (!ship) return;
      let crew = (S.startingCrewIds || []).map(id => G.Units.alive(id)).filter(Boolean);
      if (!crew.length) crew = G.Units.crew();
      G.Orders.move(crew, ship.x, ship.y + G.CONFIG.TILE * 3 + 250, 0);
    }
  };

  G.SystemManager.register('time', { update(dt){ G.State.time += dt; } });
  G.SystemManager.register('rules', {
    update(){
      const S = G.State;
      if (S.gameOver) return;
      let reason = '';
      if (!G.Units.hero()) reason = 'Commander Vance has been killed.';
      else if (!G.Units.ship()) reason = 'The Command Ship has been destroyed.';
      if (reason){ S.gameOver = true; G.Events.emit('game:defeat', { reason }); }
    }
  });

  // Fixed simulation order. Spatial indexes are rebuilt inside 'movement' (and by
  // G.rebuildSpatial() whenever a world is created or restored).
  G.SIM_ORDER = ['time', 'containers', 'economy', 'power', 'shields', 'swarm', 'commands', 'gather', 'construction', 'fabrication',
    'gates', 'paths', 'movement', 'buildings', 'combat', 'expedition', 'cleanup', 'rules'];

  G.Sim = {
    // Advances the simulation by one fixed step. Safe to call headless.
    step(dt = G.CONFIG.FIXED_DT){
      const S = G.State;
      if (S.paused || !S.grid) return;
      G.SystemManager.update(dt, G.SIM_ORDER);
    },
    run(seconds, dt = G.CONFIG.FIXED_DT){
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) this.step(dt);
    }
  };
})();
