/* Debug catalog: place any structure, item, resource node or signal on the map, and
   inspect entities with a long press. The catalog is generated from the registries.
   Also: display toggles (pixel art, fog of war) and a Units section with live counts per
   team and type, and an inspector that shows a unit's full state (it sees through fog). */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc, pct = n => Math.round(n * 100) + '%';
  const HOLD_MS = 450;

  G.DebugUI = {
    armed: null, tip: null, sticky: false,
    catalog(){
      const out = [];
      for (const d of G.Defs.buildables.all()) out.push({ group: 'Buildings', kind: 'building', key: d.key, name: d.name });
      for (const d of G.Defs.items.all()) out.push({ group: 'Items', kind: 'item', key: d.key, name: d.name });
      for (const d of G.Defs.units.all()) if (!d.footprint && d.key !== 'hero') out.push({ group: 'Units', kind: 'unit', key: d.key, name: d.name });
      for (const d of G.Defs.nodes.all()) out.push({ group: 'Assets', kind: 'node', key: d.key, name: d.name });
      out.push({ group: 'Assets', kind: 'site', key: 'Archive', name: 'Archive signal' });
      out.push({ group: 'Assets', kind: 'site', key: 'Element P', name: 'Element P' });
      return out;
    },
    symbol(e){ const d = e.kind === 'building' && G.Defs.buildables.get(e.key); return d && d.symbol ? d.symbol : G.initials(e.name); },

    // ---- Details ----
    effectLines(fx){ return Object.entries(fx || {}).map(([k, v]) => k === 'damageReduction' ? `Damage reduction ${pct(v)}` : k === 'inventoryBonus' ? `Inventory +${v} spaces` : `${k}: ${v}`); },
    itemDetails(d, it){
      const rows = [['Type', d.kind], ['Slot', d.slot]];
      rows.push(d.stackable ? ['Stack', it ? `${it.count} / ${d.maxStack}` : d.maxStack] : ['Durability', it ? `${Math.round(it.durability)} / ${d.maxDurability}` : d.maxDurability]);
      this.effectLines(d.effects).forEach(l => rows.push(['Effect', l]));
      return { title: d.name, sub: 'Item', rows, desc: d.description };
    },
    buildingDetails(d, b){
      const rows = [['Size', `${d.w}×${d.h}`]];
      if (d.level || b?.level) rows.push(['Level', b?.level || d.level]);
      if (b && b.maxHp) rows.push(['HP', `${Math.ceil(b.hp)} / ${b.maxHp}`]); else if (!d.container) rows.push(['HP', d.hp]);
      if (b?.fabQueue?.length) rows.push(['Queue', b.fabQueue.length + ' in production']);
      rows.push(['Build time', d.buildTime + 's'], ['Cost', G.Economy.describe(d.cost)]);
      if (d.container) rows.push(['Capacity', d.container.capacity + ' slots']);
      const ex = d.behaviors.find(x => x.type === 'extractor');
      if (ex){
        const n = b && G.Gather.node(b.nodeId);
        rows.push(['Stockpile', `${Math.floor(b ? G.Gather.stockTotal(b) : 0)} / ${ex.stockCap}`], ['Placement', 'Centred on any resource deposit']);
        if (b) rows.push(['Mining', n ? G.Defs.resources.get(G.Gather.def(n).resource).name : 'No deposit']);
      }
      if (d.armor) rows.push(['Armour', Math.round(d.armor * 100) + '% less damage']);
      if (d.gate) rows.push(['Gate', b ? (G.Gates.isOpen(b) ? 'Open' : 'Closed') : `Opens for friendly units within ${d.gate.openTiles} tiles; shuts while hostiles are within ${d.gate.hostileTiles}`]);
      if (d.shield) rows.push(['Field', `${d.shield.radiusTiles} tiles · ${b ? Math.floor(b.shield) + ' / ' : ''}${d.shield.capacity} charge · +${d.shield.recharge}/s`], ['Switch', b ? (b.shieldOn ? 'On' : 'Off') + ' (tap to open)' : 'On/off from its window']);
      if (d.sensor) rows.push(['Detection', `${d.sensor.detectTiles} tiles through fog, with warnings`], ['Turret boost', `+${Math.round(d.sensor.accuracyBonus * 100)}% accuracy within ${d.sensor.boostTiles} tiles`]);
      const tu = d.behaviors.find(x => x.type === 'turret');
      if (tu){
        rows.push(['Accuracy', b ? Math.round(G.Turrets.accuracy(b, tu) * 100) + '%' + (G.Sensors.bonus(b) ? ' (sensor)' : '') : Math.round(tu.accuracy * 100) + '% (100% near a Defensive Sensor)']);
        rows.push(['Weapon', `${tu.damage} dmg every ${tu.reload}s${tu.splash ? ' · blast ' + tu.splash : ''}`], ['Range', (tu.minRange ? tu.minRange + '–' : '') + tu.range], ['Targets', tu.targets === 'any' ? 'Ground and air' : tu.targets === 'air' ? 'Air only' : 'Ground only']);
        if (tu.ammo) rows.push(['Ammunition', `${Math.floor(G.Economy.get(tu.ammo))} ${G.Defs.resources.get(tu.ammo).name.toLowerCase()} in stock (1 per shot)`]);
        if (b?.testZone) rows.push(['Status', 'Testing zone: holds fire']);
      }
      if (d.power?.supply) rows.push(['Power', `${b ? Math.round(G.Power.output(b) * 10) / 10 : d.power.supply} supplied` + (d.power.scale ? ` (${Math.round(G.Power.efficiency(d.power.scale) * 100)}% ${d.power.scale} here)` : '')]);
      else if (d.power?.demand) rows.push(['Power', `${d.power.demand} while ${d.power.when || 'on'}`]);
      if (d.spawner){ const s = b ? G.Spawner.state(b) : d.spawner; rows.push(['Spawns', G.Defs.units.get(d.spawner.unit)?.name]); if (b) rows.push(['Progress', `${s.spawned} / ${s.amount} at ${s.rate}/s${s.running ? ' (running)' : ''}`]); }
      return { title: d.name, sub: 'Building', rows, desc: d.description };
    },
    unitDetails(d, u){
      const rows = [['HP', u ? `${Math.ceil(u.hp)} / ${u.maxHp}` : d.hp], ['Speed', d.speed], ['Abilities', d.capabilities.join(', ') || '—']];
      if (d.damage) rows.push(['Weapon', `${d.damage} dmg · ${d.range} range`]);
      if (d.cargoCapacity) rows.push(['Cargo', u ? `${Math.floor(G.Units.cargoTotal(u))} / ${u.cargoCapacity}` : d.cargoCapacity]);
      return { title: u?.name || d.name, sub: 'Unit', rows, desc: '' };
    },
    nodeDetails(d, n){
      const rows = [['Resource', d.resource], ['Type', d.kind === 'deposit' ? 'Mine (1×1)' : 'Scavenge']];
      if (d.kind === 'deposit'){
        rows.push(['Reserve', n ? Math.round(n.remaining).toLocaleString() : d.capacity.toLocaleString()], ['Extraction', d.rate + '/s with a ' + (G.Defs.buildables.get(d.building)?.name || d.building)]);
        if (n) rows.push(['Mine', G.Gather.mineOn(n) ? 'Built' : 'Not built']);
      } else rows.push(['Remaining', n ? `${Math.round(n.remaining)} / ${d.capacity}` : d.capacity], ['Collect rate', d.rate + '/s']);
      return { title: d.name, sub: 'Asset', rows, desc: d.description };
    },
    siteDetails(kind, p){
      const rows = [['Kind', kind]];
      if (p) rows.push(['Study', p.done ? 'Complete' : `${Math.round(p.progress / G.EXPEDITION_RULES.signalStudySeconds * 100)}%`]);
      return { title: kind === 'Archive' ? 'Archive signal' : 'Element P', sub: 'Asset', rows,
        desc: 'Studied by Commander Vance, a Survey Drone, or a nearby Sensor Station. ' + (kind === 'Archive' ? 'Yields ' + G.Economy.describe(G.EXPEDITION_RULES.archiveReward) + '.' : 'Secured into containment (max ' + G.EXPEDITION_RULES.elementPMax + ').') };
    },
    entryDetails(e){
      if (e.kind === 'building') return this.buildingDetails(G.Defs.buildables.get(e.key));
      if (e.kind === 'item') return this.itemDetails(G.Defs.items.get(e.key));
      if (e.kind === 'unit') return this.unitDetails(G.Defs.units.get(e.key));
      if (e.kind === 'node') return this.nodeDetails(G.Defs.nodes.get(e.key));
      return this.siteDetails(e.key);
    },
    containerDetails(c){
      if (c.type === 'ground_item' && c.items.length === 1) return this.itemDetails(G.Items.def(c.items[0]), c.items[0]);
      const rows = [['Contents', c.items.length ? `${c.items.length} / ${c.capacity}` : `Empty (${c.capacity} slots)`], ['State', c.opened ? 'Opened' : 'Unsearched']];
      c.items.forEach(it => rows.push(['Item', G.Items.label(it)]));
      return { title: c.name || 'Chest', sub: c.built ? 'Building' : 'Container', rows, desc: c.built ? G.Defs.buildables.get('chest').description : '' };
    },
    inspectAt(wx, wy){
      const c = G.Input.containerAt(wx, wy); if (c) return this.containerDetails(c);
      const b = G.Input.buildingAt(wx, wy); if (b) return this.buildingDetails(G.Defs.buildables.get(b.type), b);
      const n = G.Input.nodeAt(wx, wy); if (n) return this.nodeDetails(G.Defs.nodes.get(n.type), n);
      const u = G.Input.unitAt(wx, wy, true, true); if (u) return this.unitDetails(G.Defs.units.get(u.type), u);
      return null;
    },
    // Hover info in debug mode: whatever is under the mouse, else the terrain feature there.
    hoverAt(wx, wy){
      const hit = this.inspectAt(wx, wy);
      if (hit) return hit;
      const S = G.State, T = G.CONFIG.TILE, E = S.expedition;
      const sig = E && E.sites.find(p => !p.done && Math.hypot(p.x - wx, p.y - wy) < T);
      if (sig) return this.siteDetails(sig.kind);
      return this.terrainDetails(Math.floor(wx / T), Math.floor(wy / T));
    },
    // A terrain tile: what it is, whether it blocks, its height and ground detail, and the
    // nearest named place on a Woodlands map. Plain grass and clearings show nothing.
    terrainDetails(gx, gy){
      const S = G.State, grid = S.grid;
      if (!grid || !grid.inBounds(gx, gy)) return null;
      const i = gy * grid.cols + gx, t = grid.tiles[i], d = G.Defs.terrain.all().find(x => x.id === t), art = grid.art;
      const mark = art && art.detail[i] ? (G.WOODLANDS_DETAIL || [])[art.detail[i] - 1] : null;
      if (!d || ((d.key === 'grass' || d.key === 'clearing') && !mark)) return null;
      const move = !d.passable ? 'Blocks movement' : d.speed !== 1 ? `Passable, speed ×${d.speed}` : 'Passable';
      const rows = [['Tile', `${gx}, ${gy}`], ['Movement', move], ['Map', (G.MapGen.types[S.map] && G.MapGen.types[S.map].name) || S.map]];
      if (art){
        rows.push(['Height', `level ${art.level[i]} of 0–4`]);
        if (mark) rows.push(['Ground detail', mark.charAt(0) + mark.slice(1).toLowerCase().replace('_', ' ')]);
        let near = null, nd = Infinity;
        for (const p of art.places){ const dd = Math.hypot(p.x - gx, p.y - gy); if (dd < nd){ nd = dd; near = p; } }
        if (near && nd < 40) rows.push(['Near', `${near.name} (${Math.round(nd)} tiles)`]);
        const kind = d.key === 'tree' ? G.WoodlandsArt.treeKindAt(grid, gx, gy) : null;
        if (kind) rows.push(['Kind', kind.charAt(0).toUpperCase() + kind.slice(1)], ['Wind', G.Weather.current().name]);
      }
      return { title: d.name, sub: 'Terrain', rows, desc: d.passable ? '' : 'Units walk around it. The Map Editor can paint over it.' };
    },
    // Full state of one unit, for the Units inspector.
    unitDebugDetails(u){
      const d = G.Defs.units.get(u.type), T = G.CONFIG.TILE, name = id => { const v = id != null && G.Units.alive(id); return v ? `${v.name} #${v.id}` : '—'; };
      const cargo = u.cargo ? Object.entries(u.cargo).filter(([, v]) => v > 0).map(([k, v]) => Math.floor(v) + ' ' + k).join(', ') : '';
      const rows = [
        ['ID', '#' + u.id], ['Type', u.type], ['Team', u.team], ['HP', `${Math.ceil(u.hp)} / ${u.maxHp}`],
        ['Tile', `${Math.floor(u.x / T)}, ${Math.floor(u.y / T)}`], ['Heading', Math.round(((u.heading * 180 / Math.PI) % 360 + 450) % 360) + '°'],
        ['Speed', u.speed], ['Sight', `${u.sight} (${Math.round(u.sight / T)} tiles)`],
        ['Weapon', u.damage ? `${u.damage} dmg · ${u.range} range · ${u.reload}s` : '—'],
        ['Command', u.command + (u.haulState && u.haulState !== 'idle' ? ' · ' + u.haulState : '')],
        ['Target', name(u.targetId ?? u.aiTargetId)], ['Following', u.followId != null ? name(u.followId) : ''],
        ['Path', u.path.length ? `${Math.max(0, u.path.length - u.pathIndex)} waypoints left` : 'none'],
        ['AI', u.aiMode ? u.aiMode + (u.aiHold ? ' (holding)' : '') : ''], ['Spawner', u.spawnerId || ''],
        ['Cargo', cargo || (u.cargoCapacity ? 'empty' : '')], ['Queue', u.fabQueue ? u.fabQueue.map(q => q.recipe).join(', ') || 'idle' : ''],
        ['Fog', G.Fog.enabled ? (G.Fog.canSee(u) ? 'visible' : 'hidden') : 'off']
      ];
      return { title: u.name || d.name, sub: 'Unit · debug', rows, desc: '' };
    },
    // Live unit counts, by team then type.
    renderUnits(){
      const el = $('dbgUnits');
      if (!el) return;
      const counts = {};
      for (const u of G.State.units) if (u.hp > 0){ const k = u.team + '|' + u.type; counts[k] = (counts[k] || 0) + 1; }
      const keys = Object.keys(counts).sort(), sig = keys.map(k => k + counts[k]).join(',');
      if (sig === this.unitsSig) return;
      this.unitsSig = sig;
      let team = null, html = '';
      for (const k of keys){
        const [t, type] = k.split('|');
        if (t !== team){ team = t; html += `<div class="dbgTeam dbgTeam-${esc(t)}">${esc(t)} · ${keys.filter(x => x.startsWith(t + '|')).reduce((n, x) => n + counts[x], 0)}</div>`; }
        html += `<button type="button" class="dbgUnitRow" data-unit="${esc(k)}"><span>${esc(G.Defs.units.get(type)?.name || type)}</span><b>${counts[k]}</b></button>`;
      }
      el.innerHTML = html || '<div class="dbgHelp">No units.</div>';
    },
    // Centres on the next unit of a team + type and shows its details.
    focusNext(key){
      const [team, type] = key.split('|'), list = G.State.units.filter(u => u.hp > 0 && u.team === team && u.type === type);
      if (!list.length) return;
      this.cycle = this.cycle || {};
      const i = (this.cycle[key] = ((this.cycle[key] ?? -1) + 1) % list.length), u = list[i];
      G.centerCamera(u.x, u.y);
      const p = G.screenFromWorld(u.x, u.y);
      this.showTip(this.unitDebugDetails(u), p.x, p.y, true);
    },

    // ---- Spawning ----
    spawn(e, wx, wy){
      const S = G.State, T = G.CONFIG.TILE, gx = Math.floor(wx / T), gy = Math.floor(wy / T), cx = (gx + 0.5) * T, cy = (gy + 0.5) * T;
      const free = () => G.Buildings.canPlace(gx, gy, 1, 1);
      if (e.kind === 'inspect'){
        // Nearest unit of any team within a generous radius (units keep moving), fog ignored.
        let u = null, bd = 60 / G.State.camera.z;
        for (const v of S.units){ const dd = Math.hypot(v.x - wx, v.y - wy); if (v.hp > 0 && !v.isShip && dd < bd){ bd = dd; u = v; } }
        if (!u){ G.notify('No unit there'); return false; }
        const p = G.screenFromWorld(u.x, u.y);
        this.showTip(this.unitDebugDetails(u), p.x, p.y, true);
        return true;
      }
      if (e.kind === 'building'){
        const d = G.Defs.buildables.get(e.key), at = G.Buildings.placementAt(e.key, wx, wy);
        if (!G.Buildings.canPlaceKey(e.key, at.gx, at.gy)){ G.notify(d.placeOnNode === 'deposit' ? 'Place it on a free resource deposit' : 'Tile is occupied'); return false; }
        G.Buildings.add(e.key, at.gx, at.gy, { id: 'debug-' + G.newId() });
      } else if (e.kind === 'item'){
        if (!free()){ G.notify('Tile is occupied'); return false; }
        G.Containers.groundItem(cx, cy, G.Items.create(e.key), { gx, gy });
      } else if (!S.grid.passable(gx, gy)){ G.notify('Tile is blocked'); return false; }
      else if (e.kind === 'unit') G.Units.spawn(e.key, cx, cy);
      else if (e.kind === 'node'){
        if (G.Defs.nodes.get(e.key).kind === 'deposit' && G.Gather.depositAt(gx, gy)){ G.notify('A deposit is already here'); return false; }
        G.Gather.addNode(e.key, cx, cy);
      }
      else S.expedition.sites.push({ id: 'debug-site-' + G.newId(), x: cx, y: cy, kind: e.key, done: false, progress: 0 });
      G.notify(e.name + ' placed');
      return true;
    },

    // ---- Tooltip ----
    showTip(info, x, y, sticky = false){
      this.hideTip();
      const tip = document.createElement('div');
      tip.id = 'dbgTip';
      tip.innerHTML = `<b>${esc(info.title)}</b><i>${esc(info.sub)}</i>${info.rows.filter(r => r[1] != null && r[1] !== '').map(r => `<div><span>${esc(r[0])}</span>${esc(r[1])}</div>`).join('')}${info.desc ? `<p>${esc(info.desc)}</p>` : ''}`;
      document.body.appendChild(tip);
      this.tip = tip; this.sticky = sticky; this.hoverKey = null;
      this.placeTip(x, y);
    },
    hideTip(){ if (this.tip) this.tip.remove(); this.tip = null; this.sticky = false; },

    // ---- Panel ----
    isOpen(){ return !$('dbgPanel').classList.contains('hidden'); },
    toggle(open){
      const p = $('dbgPanel');
      open = open ?? p.classList.contains('hidden');
      p.classList.toggle('hidden', !open); $('dbgBtn').classList.toggle('on', open);
      if (!open){ this.armed = null; this.endHover(); } else this.render();
      G.MapEditorUI.syncButton();
    },
    render(){
      const p = $('dbgPanel'), list = this.catalog(), groups = {};
      list.forEach((e, i) => { (groups[e.group] = groups[e.group] || []).push([e, i]); });
      const a = this.armed;
      p.innerHTML = `<div class="dbgHead"><b>Debug</b><button id="dbgClose" type="button">×</button></div>
        <div class="dbgGroup">Cheats</div>
        <div class="medRow">${[100, 1000, 10000].map(n => `<button type="button" class="medSize" data-metal="${n}">+${n.toLocaleString()} metal</button>`).join('')}</div>
        <button type="button" class="dbgEntry dbgToggle${G.Cheats.god ? ' active' : ''}" data-cheat="god"><span class="dbgIcon">${G.Cheats.god ? 'ON' : 'OFF'}</span>Godmode: friendly units invincible</button>
        <button type="button" class="dbgEntry dbgToggle${G.Cheats.instantBuild ? ' active' : ''}" data-cheat="instantBuild"><span class="dbgIcon">${G.Cheats.instantBuild ? 'ON' : 'OFF'}</span>Instant build: structures and units</button>
        <div class="dbgGroup">Display</div>
        <button type="button" class="dbgEntry dbgToggle${G.Fog.enabled ? ' active' : ''}" id="dbgFog"><span class="dbgIcon">${G.Fog.enabled ? 'ON' : 'OFF'}</span>Fog of war</button>
        ${G.PixelArt.data ? `<button type="button" class="dbgEntry dbgToggle${G.PixelArt.enabled ? ' active' : ''}" id="dbgPixelArt"><span class="dbgIcon">${G.PixelArt.enabled ? 'ON' : 'OFF'}</span>Pixel-art sprites and terrain</button>` : ''}
        <div class="dbgGroup">Weather</div>
        <div class="medRow">${Object.entries(G.Weather.PRESETS).map(([k, w]) => `<button type="button" class="medSize${G.Weather.key === k ? ' on' : ''}" data-weather="${k}">${esc(w.name)}</button>`).join('')}</div>
        <div class="dbgHelp">How many Woodlands trees sway in the wind, and how fast (pixel art).</div>
        <div class="dbgGroup">Units</div>
        <button type="button" class="dbgEntry dbgToggle${a && a.kind === 'inspect' ? ' active' : ''}" id="dbgInspect"><span class="dbgIcon">${a && a.kind === 'inspect' ? 'ON' : 'OFF'}</span>Inspect: tap any unit for its full state</button>
        <div class="dbgHelp">Tap a row to jump to the next unit of that type and see its state.</div>
        <div id="dbgUnits"></div>
        <div class="dbgGroup">Place</div>
        <div class="dbgHelp">${a && a.kind !== 'inspect' ? `Tap the map to place <b>${esc(a.name)}</b>. Tap it again here to stop.` : 'Select an entry, then tap the map to place it. Hold an entry for details.'}</div>
        ${Object.entries(groups).map(([g, items]) => `<div class="dbgGroup">${esc(g)}</div>${items.map(([e, i]) => `<button type="button" class="dbgEntry${a && a.kind === e.kind && a.key === e.key ? ' active' : ''}" data-i="${i}"><span class="dbgIcon dbg-${e.kind}">${esc(this.symbol(e))}</span>${esc(e.name)}</button>`).join('')}`).join('')}`;
      $('dbgClose').onclick = () => this.toggle(false);
      p.querySelectorAll('[data-metal]').forEach(b => b.onclick = () => { G.Cheats.addResource('metal', +b.dataset.metal); G.UI.toast('+' + (+b.dataset.metal).toLocaleString() + ' metal'); });
      p.querySelectorAll('[data-cheat]').forEach(b => b.onclick = () => {
        const k = b.dataset.cheat; G.Cheats.set(k, !G.Cheats[k]);
        G.UI.toast((k === 'god' ? 'Godmode ' : 'Instant build ') + (G.Cheats[k] ? 'on' : 'off')); this.render();
      });
      if ($('dbgPixelArt')) $('dbgPixelArt').onclick = () => {
        G.PixelArt.set(!G.PixelArt.enabled); G.UI.toast('Pixel art ' + (G.PixelArt.enabled ? 'on' : 'off')); this.render();
      };
      p.querySelectorAll('[data-weather]').forEach(b => b.onclick = () => { G.Weather.set(b.dataset.weather); G.UI.toast('Weather: ' + G.Weather.current().name); this.render(); });
      $('dbgFog').onclick = () => { G.Fog.set(!G.Fog.enabled); G.UI.toast('Fog of war ' + (G.Fog.enabled ? 'on' : 'off')); this.render(); };
      $('dbgInspect').onclick = () => { this.armed = a && a.kind === 'inspect' ? null : { kind: 'inspect', key: 'inspect', name: 'unit to inspect' }; this.render(); };
      this.unitsSig = null; this.renderUnits();
      $('dbgUnits').onclick = ev => { const row = ev.target.closest('[data-unit]'); if (row) this.focusNext(row.dataset.unit); };
      // Catalog entries only (toggles have their own handlers above).
      p.querySelectorAll('.dbgEntry[data-i]').forEach(el => {
        const e = list[+el.dataset.i];
        let t = null, held = false, start = null;
        el.addEventListener('pointerdown', ev => { held = false; start = { x: ev.clientX, y: ev.clientY }; t = setTimeout(() => { held = true; this.showTip(this.entryDetails(e), start.x, start.y); }, HOLD_MS); });
        el.addEventListener('pointermove', ev => { if (start && !held && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 10){ clearTimeout(t); t = null; } });
        const end = () => { clearTimeout(t); t = null; start = null; if (!this.sticky) this.hideTip(); };
        el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('pointerleave', end);
        el.addEventListener('contextmenu', ev => ev.preventDefault());
        el.addEventListener('click', () => { if (held){ held = false; return; } this.armed = a && a.kind === e.kind && a.key === e.key ? null : e; this.render(); });
      });
    },
    // Mouse hover while the Debug panel is open: an info box follows the pointer.
    hover(e){
      if (!this.isOpen() || e.pointerType !== 'mouse' || e.buttons || !G.State.grid || G.SceneManager.currentName !== 'gameplay'){ this.endHover(); return; }
      if (this.sticky) return;
      const p = G.Input.p(e), q = G.worldFromScreen(p.x, p.y), info = this.hoverAt(q.x, q.y);
      if (!info){ this.endHover(); return; }
      const key = info.title + '|' + info.rows.map(r => r[1]).join('|');
      if (this.tip && this.hoverKey === key){ this.placeTip(e.clientX, e.clientY); return; }
      this.showTip(info, e.clientX, e.clientY);
      this.tip.classList.add('hover');
      this.hoverKey = key;
    },
    endHover(){ if (this.hoverKey){ this.hoverKey = null; if (!this.sticky) this.hideTip(); } },
    placeTip(x, y){
      const tip = this.tip, r = tip.getBoundingClientRect();
      let top = y - r.height - 14;
      if (top < 6) top = Math.min(innerHeight - r.height - 6, y + 18);
      tip.style.left = Math.min(Math.max(6, x + 14), innerWidth - r.width - 6) + 'px';
      tip.style.top = top + 'px';
    },
    init(){
      $('dbgBtn').addEventListener('click', () => this.toggle());
      G.Renderer.cv.addEventListener('pointermove', e => this.hover(e));
      G.Renderer.cv.addEventListener('pointerleave', () => this.endHover());
      setInterval(() => { if (this.isOpen()) this.renderUnits(); }, 1000);   // live unit counts
      $('dbgPanel').addEventListener('pointerdown', e => e.stopPropagation());
      addEventListener('wheel', () => { if (this.sticky) this.hideTip(); }, { capture: true, passive: true });
      document.addEventListener('pointerdown', () => { if (this.sticky) this.hideTip(); }, true);
      G.Events.on('scene:changed', ({ name }) => { if (name !== 'gameplay' && this.isOpen()) this.toggle(false); });
    }
  };
})();
