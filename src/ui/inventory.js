/* Backpack, equipment and container panels with drag-and-drop, double-tap shortcuts and
   hold-for-details. */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc;
  const SLOT_NAMES = { head: 'Head', chest: 'Chest', leftArm: 'L Arm', rightArm: 'R Arm', leftHand: 'L Hand', rightHand: 'R Hand', leftLeg: 'L Leg', rightLeg: 'R Leg', leftFoot: 'L Foot', rightFoot: 'R Foot', backpack: 'Pack' };
  const SLOT_CLASS = { head: 'slot-head', chest: 'slot-chest', leftArm: 'slot-left-arm', rightArm: 'slot-right-arm', leftHand: 'slot-left-hand', rightHand: 'slot-right-hand', leftLeg: 'slot-left-leg', rightLeg: 'slot-right-leg', leftFoot: 'slot-left-foot', rightFoot: 'slot-right-foot', backpack: 'slot-backpack' };

  function icon(it){
    if (!it) return '';
    const d = G.Items.def(it) || {}, hat = d.slot === 'head';
    const dur = d.stackable ? `<div class="inv-count">${it.count}</div>` : `<div class="inv-durability"><i style="width:${G.clamp(it.durability / it.maxDurability * 100, 0, 100)}%"></i></div>`;
    return `<div class="inv-icon ${hat ? 'hat' : ''}">${hat ? '' : esc(G.Items.name(it).slice(0, 3).toUpperCase())}</div>${dur}`;
  }

  G.InventoryUI = {
    container(){ const id = G.State.selectedContainer; return id ? (G.Containers.get(id) || this.unitStorage(id)) : null; },
    unitStorage(id){ for (const u of G.State.units) if (u.storage && u.storage.id === id) return u.storage; return null; },
    isOpen(id){ return !$(id).classList.contains('hidden'); },
    toggle(){
      const p = $('inventoryPanel');
      if (this.isOpen('inventoryPanel') && this.isOpen('chestPanel') && G.State.selectedContainer){ G.UI.toast('Inventory stays open while a container is open'); return; }
      if (this.isOpen('inventoryPanel')) p.classList.add('hidden');
      else { p.classList.remove('hidden'); this.renderInventory(); }
    },
    openContainer(c){
      G.State.selectedContainer = c.id;
      $('inventoryPanel').classList.remove('hidden'); $('chestPanel').classList.remove('hidden');
      this.renderInventory(); this.renderChest();
    },
    closeContainer(){ $('chestPanel').classList.add('hidden'); G.State.selectedContainer = null; },
    openUnitStorage(u){
      const h = G.Units.hero();
      if (!u || !u.storage) return;
      if (!h || !G.within(h, u, 170)){ G.UI.toast('Move the Utility Spider closer to Commander Vance'); return; }
      this.openContainer(u.storage);
    },
    // Closes the inventory (and any open container, which needs it open).
    close(){
      if (G.State.selectedContainer) this.closeContainer();
      $('inventoryPanel').classList.add('hidden');
    },
    bindHead(){ const b = $('invClose'); if (b) b.onclick = () => this.close(); },
    // Drag the panel by its title bar. The position is kept (clamped to the screen) until
    // the page is reloaded.
    initDrag(){
      const p = $('inventoryPanel');
      let drag = null;
      const place = (x, y) => {
        const w = p.offsetWidth, h = p.querySelector('[data-drag-handle]')?.offsetHeight || 40;
        p.style.left = G.clamp(x, 0, Math.max(0, innerWidth - w)) + 'px';
        p.style.top = G.clamp(y, 0, Math.max(0, innerHeight - h)) + 'px';
        p.style.right = 'auto';
      };
      p.addEventListener('pointerdown', e => {
        const handle = e.target.closest('[data-drag-handle]');
        if (!handle || e.target.closest('button')) return;
        const r = p.getBoundingClientRect();
        drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
        handle.setPointerCapture(e.pointerId);
        p.classList.add('dragging');
        e.preventDefault();
      });
      p.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.id) place(e.clientX - drag.dx, e.clientY - drag.dy); });
      const end = e => { if (drag && e.pointerId === drag.id){ drag = null; p.classList.remove('dragging'); } };
      p.addEventListener('pointerup', end); p.addEventListener('pointercancel', end);
      addEventListener('resize', () => { if (p.style.left) place(parseFloat(p.style.left), parseFloat(p.style.top)); });
    },
    renderInventory(){
      const p = $('inventoryPanel'), I = G.Inventory;
      const head = title => `<div class="panel-drag-head" data-drag-handle title="Drag to move"><button type="button" class="panel-close" id="invClose" aria-label="Close inventory">×</button><h3>${title}</h3></div>`;
      if (!G.Units.hero()){ p.innerHTML = head('Inventory') + 'No commander'; this.bindHead(); return; }
      const equipSlot = k => {
        const it = I.equipment[k];
        return `<div class="body-equip-slot ${SLOT_CLASS[k]} inv-slot ${it ? 'item-live' : ''}" data-drop-zone="equipment" data-equip-target="${k}" ${it ? `data-source="equipped" data-item-id="${esc(it.id)}" data-equip-slot="${k}"` : ''} title="${SLOT_NAMES[k]}">${icon(it)}<span class="body-slot-label">${SLOT_NAMES[k]}</span></div>`;
      };
      const cap = I.capacity(), visual = Math.max(36, cap);
      let cells = '';
      for (let i = 0; i < visual; i++){
        const locked = i >= cap, it = I.items[i] || null;
        cells += `<div class="inv-slot ${locked ? 'locked' : it ? 'item-live' : 'empty'}" ${!locked && it ? `data-source="backpack" data-item-id="${esc(it.id)}"` : ''} title="${locked ? 'Locked — equip a larger pack' : it ? esc(G.Items.label(it)) : 'Empty slot'}">${locked ? '' : icon(it)}</div>`;
      }
      const pack = I.equipment.backpack;
      p.innerHTML = `${head('Commander Vance — Inventory')}
        <div class="inventory-count">${I.items.length} / ${cap} spaces used · Base ${I.baseCapacity}${pack ? ' · Backpack +' + (G.Items.effects(pack).inventoryBonus || 0) : ''}</div>
        <div class="inventory-main">
          <div class="character-pane equipped-character">
            <div class="character-figure"><div class="head"></div><div class="body"></div><div class="arm l"></div><div class="arm r"></div><div class="leg l"></div><div class="leg r"></div></div>
            ${G.EQUIPMENT_SLOTS.map(equipSlot).join('')}
          </div>
          <div class="inventory-section-title">Backpack Inventory</div>
          <div class="transfer-hint">Drag gear onto the matching body slot. Double-click a backpack item to auto-equip. Hold any item for details.</div>
          <div class="inventory-scroll backpack-drop-zone" data-drop-zone="backpack"><div class="inventory-grid">${cells}</div></div>
        </div>`;
      this.bindHead();
      this.bindItems(p);
    },
    renderChest(){
      const p = $('chestPanel'), c = this.container(), h = G.Units.hero(), q = G.State.searching;
      if (!c){ p.classList.add('hidden'); return; }
      const near = h && G.within(h, c, G.CONFIG.INTERACT_RANGE), searching = q && q.containerId === c.id, title = esc(c.name || (c.mobileUnitId ? 'Storage' : 'Chest'));
      if (!c.opened){
        const progress = searching ? (1 - q.remaining / q.total) * 100 : 0;
        p.innerHTML = `<div class="container-title-row"><h3>${title}</h3><button id="closeContainerBtn">×</button></div>
          <div class="muted">Search this container before its contents can be moved.</div>
          ${searching ? `<div class="searchbar"><i style="width:${G.clamp(progress, 0, 100)}%"></i></div><div>Searching… ${Math.max(0, q.remaining).toFixed(1)}s</div>`
            : `<button id="searchChestBtn" ${near ? '' : 'disabled'}>Search (${G.Containers.SEARCH_SECONDS.toFixed(1)}s)</button>`}`;
      } else {
        let cells = '';
        for (let i = 0; i < c.capacity; i++){
          const it = c.items[i] || null;
          cells += it ? `<div class="inv-slot item-live" data-source="container" data-item-id="${esc(it.id)}" title="${esc(G.Items.label(it))}">${icon(it)}</div>` : '<div class="inv-slot empty" title="Empty slot"></div>';
        }
        p.innerHTML = `<div class="container-title-row"><h3>${title}</h3><button id="closeContainerBtn">×</button></div>
          <div class="transfer-hint">${c.items.length} / ${c.capacity} slots used · Drag items between this storage and the backpack. Double-click an item here to take it. Hold for details.</div>
          <div class="container-drop-zone" data-drop-zone="container"><div class="container-grid">${cells}</div></div>`;
        this.bindItems(p);
      }
      const close = $('closeContainerBtn'); if (close) close.addEventListener('click', () => this.closeContainer());
      const b = $('searchChestBtn'); if (b) b.addEventListener('click', () => G.Containers.begin(c));
    },
    refreshSearch(){
      const q = G.State.searching;
      if (!q || !this.isOpen('chestPanel') || G.State.selectedContainer !== q.containerId) return;
      const t = performance.now();
      if (!this._lastPaint || t - this._lastPaint > 120){ this._lastPaint = t; this.renderChest(); }
    },
    findItem(source, id, slot){
      if (source === 'container'){ const c = this.container(); return c ? c.items.find(x => x.id === id) : null; }
      if (source === 'backpack') return G.Inventory.items.find(x => x.id === id) || null;
      if (source === 'equipped') return slot ? G.Inventory.equipment[slot] : Object.values(G.Inventory.equipment).find(x => x && x.id === id);
      return null;
    },
    showItemInfo(item, x, y){
      this.closeItemInfo();
      if (!item) return;
      const d = G.Items.def(item) || {};
      const fx = Object.entries(G.Items.effects(item)).map(([k, v]) => `${esc(k.replace(/([A-Z])/g, ' $1'))}: ${typeof v === 'number' && v < 1 ? Math.round(v * 100) + '%' : esc(v)}`).join('<br>') || 'None';
      const box = document.createElement('div');
      box.className = 'item-info-menu'; box.id = 'itemInfoMenu';
      box.innerHTML = `<h4>${esc(G.Items.label(item))}</h4><p>${esc(d.description || '')}</p><p><b>Slot:</b> ${esc(d.slot || 'None')}<br>${d.stackable ? `<b>Stack:</b> ${item.count} / ${d.maxStack}` : `<b>Durability:</b> ${Math.ceil(item.durability)} / ${item.maxDurability}`}<br><b>Effects:</b><br>${fx}</p><button class="close-info">Close</button>`;
      document.body.appendChild(box);
      const r = box.getBoundingClientRect();
      box.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, x + 12)) + 'px';
      box.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, y + 12)) + 'px';
      box.querySelector('button').addEventListener('click', () => this.closeItemInfo());
    },
    closeItemInfo(){ const n = $('itemInfoMenu'); if (n) n.remove(); },
    bindItems(root){
      root.querySelectorAll('.item-live[data-item-id]').forEach(el => {
        let hold = null, start = null, ghost = null, dragging = false, lastTap = 0;
        const cancelHold = () => { if (hold){ clearTimeout(hold); hold = null; } };
        el.addEventListener('pointerdown', e => {
          if (e.button != null && e.button !== 0) return;
          e.preventDefault(); start = { x: e.clientX, y: e.clientY }; dragging = false;
          if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
          cancelHold();
          hold = setTimeout(() => { hold = null; if (!dragging) this.showItemInfo(this.findItem(el.dataset.source, el.dataset.itemId, el.dataset.equipSlot), e.clientX, e.clientY); }, 500);
        });
        el.addEventListener('pointermove', e => {
          if (!start) return;
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8 && !dragging){
            cancelHold(); dragging = true; this.closeItemInfo();
            ghost = document.createElement('div'); ghost.className = 'drag-ghost';
            const it = this.findItem(el.dataset.source, el.dataset.itemId, el.dataset.equipSlot);
            ghost.textContent = it ? G.Items.name(it).slice(0, 3).toUpperCase() : '';
            document.body.appendChild(ghost);
          }
          if (ghost){ ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; }
        });
        el.addEventListener('pointerup', e => {
          cancelHold();
          if (!start) return;
          const wasDrag = dragging; start = null; dragging = false;
          if (ghost){ ghost.remove(); ghost = null; }
          const source = el.dataset.source, id = el.dataset.itemId, c = this.container();
          if (wasDrag){
            const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop-zone]'), zone = target?.dataset.dropZone;
            if (zone === 'backpack' && source === 'container') G.Inventory.takeFromContainer(c, id);
            else if (zone === 'container' && source === 'backpack') G.Inventory.giveToContainer(c, id);
            else if (zone === 'equipment' && source === 'backpack') G.Inventory.equip(id, target.dataset.equipTarget);
            else if (zone === 'backpack' && source === 'equipped') G.Inventory.unequip(el.dataset.equipSlot);
          } else {
            const t = performance.now();
            if (t - lastTap < 320){
              if (source === 'container') G.Inventory.takeFromContainer(c, id);
              else if (source === 'backpack') G.Inventory.equip(id);
              lastTap = 0;
            } else lastTap = t;
          }
        });
        el.addEventListener('pointercancel', () => { cancelHold(); start = null; dragging = false; if (ghost) ghost.remove(); ghost = null; });
      });
    }
  };
  G.UI.toggleInventory = () => G.InventoryUI.toggle();

  G.Events.on('inventory:changed', () => { if (G.InventoryUI.isOpen('inventoryPanel')) G.InventoryUI.renderInventory(); });
  G.Events.on('container:changed', () => { if (G.InventoryUI.isOpen('chestPanel')) G.InventoryUI.renderChest(); });
  G.Events.on('container:opened', c => G.InventoryUI.openContainer(c));
  G.Events.on('world:created', () => { G.InventoryUI.closeContainer(); $('inventoryPanel').classList.add('hidden'); });
})();
