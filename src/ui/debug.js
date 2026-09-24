/* Debug catalog: place any structure, item, resource node or signal on the map, and
   inspect entities with a long press. The catalog is generated from the registries. */
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
      if (ex) rows.push(['Stockpile', `${Math.floor(b ? G.Gather.stockTotal(b) : 0)} / ${ex.stockCap}`], ['Placement', 'Centred on a mine deposit']);
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
      const u = G.Input.unitAt(wx, wy, true); if (u) return this.unitDetails(G.Defs.units.get(u.type), u);
      return null;
    },

    // ---- Spawning ----
    spawn(e, wx, wy){
      const S = G.State, T = G.CONFIG.TILE, gx = Math.floor(wx / T), gy = Math.floor(wy / T), cx = (gx + 0.5) * T, cy = (gy + 0.5) * T;
      const free = () => G.Buildings.canPlace(gx, gy, 1, 1);
      if (e.kind === 'building'){
        const d = G.Defs.buildables.get(e.key), at = G.Buildings.placementAt(e.key, wx, wy);
        if (!G.Buildings.canPlaceKey(e.key, at.gx, at.gy)){ G.notify(d.placeOnNode === 'deposit' ? 'Place it on a free mine deposit' : 'Tile is occupied'); return false; }
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
      const r = tip.getBoundingClientRect();
      let top = y - r.height - 14;
      if (top < 6) top = Math.min(innerHeight - r.height - 6, y + 18);
      tip.style.left = Math.min(Math.max(6, x + 14), innerWidth - r.width - 6) + 'px';
      tip.style.top = top + 'px';
      this.tip = tip; this.sticky = sticky;
    },
    hideTip(){ if (this.tip) this.tip.remove(); this.tip = null; this.sticky = false; },

    // ---- Panel ----
    isOpen(){ return !$('dbgPanel').classList.contains('hidden'); },
    toggle(open){
      const p = $('dbgPanel');
      open = open ?? p.classList.contains('hidden');
      p.classList.toggle('hidden', !open); $('dbgBtn').classList.toggle('on', open);
      if (!open) this.armed = null; else this.render();
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
        ${G.PixelArt.data ? `<div class="dbgGroup">Display</div>
        <button type="button" class="dbgEntry dbgToggle${G.PixelArt.enabled ? ' active' : ''}" id="dbgPixelArt"><span class="dbgIcon">${G.PixelArt.enabled ? 'ON' : 'OFF'}</span>Pixel-art sprites and terrain</button>` : ''}
        <div class="dbgGroup">Place</div>
        <div class="dbgHelp">${a ? `Tap the map to place <b>${esc(a.name)}</b>. Tap it again here to stop.` : 'Select an entry, then tap the map to place it. Hold an entry for details.'}</div>
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
      p.querySelectorAll('.dbgEntry').forEach(el => {
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
    init(){
      $('dbgBtn').addEventListener('click', () => this.toggle());
      $('dbgPanel').addEventListener('pointerdown', e => e.stopPropagation());
      addEventListener('wheel', () => { if (this.sticky) this.hideTip(); }, { capture: true, passive: true });
      document.addEventListener('pointerdown', () => { if (this.sticky) this.hideTip(); }, true);
      G.Events.on('scene:changed', ({ name }) => { if (name !== 'gameplay' && this.isOpen()) this.toggle(false); });
    }
  };
})();
