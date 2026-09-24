/* Pointer, touch and keyboard input.
   Mouse: click select, shift-click add, drag box, right-click move, wheel zoom.
   Touch: tap select / move, drag pan, pinch zoom, hold-drag box select or formation
   placement with rotation, double tap to deselect. Long press on anything inspects it. */
(function(){
  'use strict';
  const G = GW;
  const HOLD_MS = 300, INSPECT_MS = 450, SLOP = 6;

  G.Input = {
    ptr: new Map(), box: null, dragCam: null, pinch: null, keys: new Set(), lastTap: { t: 0, x: 0, y: 0 },
    commandMode: null, rallyFor: null, touchHold: null, formationGesture: null, buildGesture: null, inspect: null,
    init(){
      const cv = G.Renderer.cv, C = G.CONFIG;
      cv.style.touchAction = 'none';
      cv.addEventListener('contextmenu', e => e.preventDefault());
      cv.addEventListener('wheel', e => {
        e.preventDefault();
        if (G.State.paused) return;
        const p = this.p(e), c = G.State.camera, w = G.worldFromScreen(p.x, p.y);
        c.z = G.clamp(c.z * (e.deltaY < 0 ? 1.13 : 1 / 1.13), C.ZOOM_MIN, C.ZOOM_MAX);
        c.x = w.x - p.x / c.z; c.y = w.y - p.y / c.z; G.clampCamera();
      }, { passive: false });
      cv.addEventListener('pointerdown', e => this.down(e));
      cv.addEventListener('pointermove', e => this.move(e));
      cv.addEventListener('pointerup', e => this.up(e));
      cv.addEventListener('pointercancel', e => this.cancel(e));
      cv.addEventListener('dblclick', e => { e.preventDefault(); if (G.BuildUI.active()) return; G.Selection.clear(); G.UI.toast('Units deselected'); });
      addEventListener('keydown', e => this.key(e));
      addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
      addEventListener('blur', () => this.keys.clear());
      document.addEventListener('visibilitychange', () => this.keys.clear());
      document.getElementById('minimap').addEventListener('pointerdown', e => {
        const r = e.currentTarget.getBoundingClientRect();
        G.centerCamera((e.clientX - r.left) / r.width * C.WORLD_W, (e.clientY - r.top) / r.height * C.WORLD_H);
      });
    },
    key(e){
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)){ this.keys.add(k); e.preventDefault(); }
      if (G.SceneManager.currentName !== 'gameplay') return;
      if (k === 'h'){ const sh = G.Units.ship(); if (sh) G.centerCamera(sh.x, sh.y); }
      else if (k === 'f3'){ e.preventDefault(); G.UI.toggleDev(); }
      else if (k === 'i'){ e.preventDefault(); G.UI.toggleInventory(); }
      else if (k === ' '){ e.preventDefault(); G.UI.togglePause(); }
      else if (k === 'escape'){
        if (G.BuildUI.active()) G.BuildUI.cancel();
        else if (this.commandMode){ this.commandMode = null; this.rallyFor = null; G.UI.toast('Order cancelled'); if (G.SpawnerUI.isOpen()) G.SpawnerUI.render(); }
        else G.Selection.clear();
      }
    },
    p(e){ const r = G.Renderer.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },

    // ---- Hit tests (world coordinates) ----
    radius(){ return 28 / G.State.camera.z; },
    unitAt(wx, wy, anyTeam = false){
      const S = G.State, r = this.radius();
      let best = null, bd = r;
      for (const u of S.spatial.query(wx, wy, r + 20)){
        if (u.hp <= 0 || u.isShip || (!anyTeam && u.team !== 'blue')) continue;
        const d = Math.hypot(u.x - wx, u.y - wy);
        if (d < bd){ bd = d; best = u; }
      }
      if (best) return best;
      const sh = G.Units.ship(), T = G.CONFIG.TILE;
      return sh && Math.abs(wx - sh.x) <= sh.w * T / 2 && Math.abs(wy - sh.y) <= sh.h * T / 2 ? sh : null;
    },
    containerAt(wx, wy){
      let best = null, bd = this.radius();
      for (const c of G.State.containers){
        if (c.type === 'ground_item' && !c.items.length) continue;
        const d = Math.hypot(c.x - wx, c.y - wy);
        if (d < bd){ bd = d; best = c; }
      }
      return best;
    },
    buildingAt(wx, wy){ const T = G.CONFIG.TILE; return G.Buildings.at(Math.floor(wx / T), Math.floor(wy / T)); },
    nodeAt(wx, wy){ const r = 32 / G.State.camera.z; return G.State.resourceNodes.find(n => n.remaining > 0 && Math.hypot(n.x - wx, n.y - wy) < r) || null; },
    // Something a gatherer can be sent to: a Mine Building, or a scavenge / deposit node.
    gatherTarget(wx, wy){
      const b = this.buildingAt(wx, wy);
      if (b && G.Gather.isMine(b)) return b;
      return this.nodeAt(wx, wy);
    },
    canInteract(){ const S = G.State; return S.camera.z >= G.CONFIG.INTERACT_MIN_ZOOM && S.selected.has(S.heroId); },
    selectedUnits(){ return G.Selection.units(); },
    gatherer(){ return this.selectedUnits().find(u => G.Units.can(u, 'gather')); },

    // ---- Pointer lifecycle ----
    down(e){
      if (G.State.paused) return;
      G.Renderer.cv.setPointerCapture(e.pointerId);
      const p = this.p(e), q = G.worldFromScreen(p.x, p.y);
      this.ptr.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, button: e.button, moved: false, type: e.pointerType });
      if (G.BuildUI.placing()){
        // Placement owns the pointer: no pan, box, formation or pinch can start.
        if (this.ptr.size > 1){ this.ptr.delete(e.pointerId); return; }
        G.BuildUI.previewAt(q.x, q.y);
        this.buildGesture = { id: e.pointerId };
        this.dragCam = null; this.box = null; this.cancelTouchHold(); this.cancelFormationGesture(); return;
      }
      // Map Editor: one finger (or the left button) edits; a second finger ends the stroke
      // and pinches as usual.
      if (G.MapEditorUI.active() && (e.pointerType !== 'mouse' || e.button === 0)){
        if (this.ptr.size === 1){
          this.ptr.get(e.pointerId).handled = true;
          if (G.MapEditorUI.pointerDown(q.x, q.y)) this.editGesture = { id: e.pointerId };
          return;
        }
        G.MapEditorUI.pointerUp(); this.editGesture = null;
      }
      if (this.ptr.size === 2){
        this.cancelTouchHold(); this.cancelFormationGesture(); this.cancelInspect();
        const a = [...this.ptr.values()];
        this.box = null; this.dragCam = null; a.forEach(o => { o.moved = true; o.gesture = true; });
        this.pinch = { anchor: G.worldFromScreen((a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2), d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), z: G.State.camera.z };
        return;
      }
      // A pointer consumed here must not also act as a tap / click on release.
      const consume = () => { const o = this.ptr.get(e.pointerId); if (o) o.handled = true; };
      if (e.button === 2){
        const us = this.selectedUnits(), target = this.gatherTarget(q.x, q.y), gatherer = this.gatherer();
        if (target && gatherer) G.Gather.command(gatherer, target);
        else if (us.length) G.Orders.move(us, q.x, q.y);
        return;
      }
      if (this.commandMode === 'rally'){
        consume();
        const b = G.State.buildings.find(x => x.id === this.rallyFor && x.hp > 0);
        this.commandMode = null; this.rallyFor = null;
        if (b){ G.Spawner.configure(b, { rally: { x: q.x, y: q.y } }); G.UI.toast('Rally point moved'); }
        if (G.SpawnerUI.isOpen()) G.SpawnerUI.render();
        return;
      }
      if (this.commandMode === 'follow'){
        consume();
        const t = this.unitAt(q.x, q.y);
        if (!t){ G.UI.toast('Tap the friendly unit to follow · Esc to cancel'); return; }
        const us = this.selectedUnits(), done = G.Orders.setCommand(us, 'follow', null, t.id);
        G.UI.toast(done.length ? `${done.length === 1 ? done[0].name : done.length + ' units'} following ${t.name}` : 'A unit cannot follow itself');
        this.commandMode = null; G.UI.refreshSelection(true); return;
      }
      if (this.commandMode){
        consume();
        G.Orders.setCommand(this.selectedUnits(), this.commandMode, q);
        G.UI.toast(this.commandMode === 'guard' ? 'Guard location set' : 'Patrol route set');
        this.commandMode = null; G.UI.refreshSelection(true); return;
      }
      this.startInspect(e.pointerId, e.clientX, e.clientY, q);
      const chest = this.canInteract() && this.containerAt(q.x, q.y);
      if (chest){ consume(); G.InventoryUI.openContainer(chest); return; }
      const target = this.gatherTarget(q.x, q.y), gatherer = this.gatherer();
      if (target && gatherer){ consume(); G.Gather.command(gatherer, target); return; }
      const hit = this.unitAt(q.x, q.y);
      if (hit && e.pointerType === 'mouse'){
        const has = G.State.selected.has(hit.id);
        if (e.shiftKey){ if (!has) G.Selection.toggle(hit.id); }
        else if (has) G.Selection.toggle(hit.id);
        else G.Selection.set([hit.id]);
        return;
      }
      if (hit) return;   // touch selection commits on pointerup so a tap toggles once
      if (e.pointerType === 'mouse' && e.button === 0){ this.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; return; }
      if (e.pointerType !== 'mouse'){
        const group = this.selectedUnits().length > 1;
        this.touchHold = { id: e.pointerId, armed: false, timer: setTimeout(() => {
          const o = this.ptr.get(e.pointerId);
          if (!o || o.moved || this.ptr.size !== 1) return;
          this.dragCam = null; this.touchHold.armed = true; this.cancelInspect();
          if (group){
            const w = G.worldFromScreen(o.sx, o.sy), angle = G.State.formationAngle || 0;
            this.formationGesture = { id: e.pointerId, anchorScreen: { x: o.sx, y: o.sy }, anchorWorld: w, angle };
            this.updateFormationPreview(w.x + Math.cos(angle) * 110, w.y + Math.sin(angle) * 110, angle);
            G.UI.toast('Drag to rotate formation · release to move');
          } else { this.box = { x0: o.sx, y0: o.sy, x1: o.x, y1: o.y }; G.UI.toast('Drag to select units'); }
        }, HOLD_MS) };
      }
      this.dragCam = { id: e.pointerId, lastX: p.x, lastY: p.y };
    },
    move(e){
      const o = this.ptr.get(e.pointerId);
      if (!o) return;
      const p = this.p(e), dist = Math.hypot(p.x - o.sx, p.y - o.sy);
      if (this.editGesture && this.editGesture.id === e.pointerId){
        o.x = p.x; o.y = p.y; o.moved = o.moved || dist > SLOP;
        const q = G.worldFromScreen(p.x, p.y); G.MapEditorUI.pointerMove(q.x, q.y); return;
      }
      if (this.inspect && this.inspect.id === e.pointerId && dist > 10) this.cancelInspect();
      if (this.buildGesture && this.buildGesture.id === e.pointerId){
        o.x = p.x; o.y = p.y; o.moved = o.moved || dist > 4;
        const q = G.worldFromScreen(p.x, p.y); G.BuildUI.previewAt(q.x, q.y); return;
      }
      if (this.formationGesture && this.formationGesture.id === e.pointerId){
        o.x = p.x; o.y = p.y;
        const a = this.formationGesture.anchorScreen, angle = Math.atan2(p.y - a.y, p.x - a.x), hw = G.worldFromScreen(p.x, p.y);
        this.formationGesture.angle = angle;
        this.updateFormationPreview(hw.x, hw.y, angle);
        return;
      }
      if (this.touchHold && this.touchHold.id === e.pointerId && !this.touchHold.armed && dist > SLOP) this.cancelTouchHold();
      o.moved = o.moved || dist > SLOP; o.x = p.x; o.y = p.y;
      if (this.ptr.size === 2 && this.pinch){
        const a = [...this.ptr.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2, c = G.State.camera;
        c.z = G.clamp(this.pinch.z * d / Math.max(10, this.pinch.d), G.CONFIG.ZOOM_MIN, G.CONFIG.ZOOM_MAX);
        c.x = this.pinch.anchor.x - mx / c.z; c.y = this.pinch.anchor.y - my / c.z; G.clampCamera();
        return;
      }
      if (this.box){ this.box.x1 = p.x; this.box.y1 = p.y; }
      else if (this.dragCam && this.dragCam.id === e.pointerId && o.moved){
        const c = G.State.camera;
        c.x -= (p.x - this.dragCam.lastX) / c.z; c.y -= (p.y - this.dragCam.lastY) / c.z;
        this.dragCam.lastX = p.x; this.dragCam.lastY = p.y; G.clampCamera();
      } else if (this.dragCam && this.dragCam.id === e.pointerId){ this.dragCam.lastX = p.x; this.dragCam.lastY = p.y; }
    },
    up(e){
      const o = this.ptr.get(e.pointerId);
      if (!o) return;
      if (this.editGesture && this.editGesture.id === e.pointerId){ G.MapEditorUI.pointerUp(); this.editGesture = null; }
      const S = G.State, inspected = this.inspect && this.inspect.id === e.pointerId && this.inspect.shown;
      this.cancelInspect();
      const finish = () => { this.ptr.delete(e.pointerId); if (this.ptr.size < 2) this.pinch = null; this.dragCam = null; this.touchHold = null; };
      if (inspected){ this.box = null; this.cancelFormationGesture(); finish(); return; }
      if (this.buildGesture && this.buildGesture.id === e.pointerId){ G.BuildUI.confirm(); this.buildGesture = null; this.box = null; finish(); return; }
      if (this.touchHold && this.touchHold.timer) clearTimeout(this.touchHold.timer);
      if (this.formationGesture && this.formationGesture.id === e.pointerId){
        const fg = this.formationGesture;
        G.Orders.move(this.selectedUnits(), fg.anchorWorld.x, fg.anchorWorld.y, fg.angle);
        G.UI.toast('Formation move issued');
        this.cancelFormationGesture(); finish(); return;
      }
      if (o.handled){ this.box = null; finish(); return; }
      const q = G.worldFromScreen(o.x, o.y);
      // Plain click / tap on the map (no drag).
      if (!o.moved && !o.gesture && (o.button === 0 || o.button == null)){
        if (G.DebugUI.armed && G.DebugUI.isOpen()){ G.DebugUI.spawn(G.DebugUI.armed, q.x, q.y); this.box = null; finish(); return; }
        const b = this.buildingAt(q.x, q.y);
        if (b && !this.unitAt(q.x, q.y)){
          if (b.fabQueue) G.ExpeditionUI.openFabrication(b.id);
          else if (G.Spawner.def(b)) G.SpawnerUI.open(b.id);
          else G.DebugUI.showTip(G.DebugUI.buildingDetails(G.Defs.buildables.get(b.type), b), e.clientX, e.clientY, true);
          this.box = null; finish(); return;
        }
      }
      if (this.ptr.size === 1 && this.box){
        const b = this.box, x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
        if (Math.hypot(x1 - x0, y1 - y0) > 8){
          const ids = e.shiftKey ? [...S.selected] : [];
          for (const u of S.units){
            if (u.team !== 'blue' || u.isShip || u.hp <= 0) continue;
            const s = G.screenFromWorld(u.x, u.y);
            if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1 && !ids.includes(u.id)) ids.push(u.id);
          }
          G.Selection.set(ids);
        } else if (!this.unitAt(q.x, q.y) && !e.shiftKey) G.Selection.clear();
        this.box = null;
      } else if (this.ptr.size === 1 && o.type !== 'mouse' && !o.moved && !o.gesture){
        const t = performance.now(), dbl = t - this.lastTap.t < 330 && Math.hypot(o.x - this.lastTap.x, o.y - this.lastTap.y) < 28;
        this.lastTap = { t, x: o.x, y: o.y };
        if (dbl){ G.Selection.clear(); G.UI.toast('Units deselected'); }
        else {
          const hit = this.unitAt(q.x, q.y);
          if (hit){ if (S.selected.has(hit.id)) G.Selection.toggle(hit.id); else G.Selection.set([hit.id]); }
          else {
            const us = this.selectedUnits();
            if (us.length) G.Orders.move(us, q.x, q.y);
            else G.Selection.clear();
          }
        }
      }
      finish();
    },
    cancel(e){
      if (this.editGesture){ G.MapEditorUI.pointerUp(); this.editGesture = null; }
      this.cancelTouchHold(); this.cancelFormationGesture(); this.cancelInspect();
      this.buildGesture = null; this.ptr.delete(e.pointerId); this.box = null; this.dragCam = null;
      if (this.ptr.size < 2) this.pinch = null;
    },
    cancelTouchHold(){ if (this.touchHold && this.touchHold.timer) clearTimeout(this.touchHold.timer); this.touchHold = null; },
    cancelFormationGesture(){ this.formationGesture = null; G.State.formationPreview = null; },
    updateFormationPreview(hx, hy, angle){
      const fg = this.formationGesture, w = fg.anchorWorld;
      G.State.formationPreview = { x: w.x, y: w.y, handleX: hx, handleY: hy, angle, slots: G.Formations.slots(this.selectedUnits(), G.State.formation, w.x, w.y, angle) };
    },
    // Long press on an entity shows its details.
    startInspect(id, cx, cy, q){
      this.cancelInspect();
      if (!G.DebugUI.inspectAt(q.x, q.y)) return;
      this.inspect = { id, shown: false, timer: setTimeout(() => {
        const info = G.DebugUI.inspectAt(q.x, q.y);
        if (!info || !this.inspect) return;
        this.inspect.shown = true;
        this.cancelTouchHold(); this.box = null; this.dragCam = null;
        G.DebugUI.showTip(info, cx, cy);
      }, INSPECT_MS) };
    },
    cancelInspect(){
      if (!this.inspect) return;
      clearTimeout(this.inspect.timer);
      if (this.inspect.shown) G.DebugUI.hideTip();
      this.inspect = null;
    },
    // Keyboard camera pan, driven by real frame time.
    update(dt){
      if (G.State.paused || !this.keys.size || !(dt > 0)) return;
      const k = this.keys, c = G.State.camera, s = 700 / c.z;
      if (k.has('a') || k.has('arrowleft')) c.x -= s * dt;
      if (k.has('d') || k.has('arrowright')) c.x += s * dt;
      if (k.has('w') || k.has('arrowup')) c.y -= s * dt;
      if (k.has('s') || k.has('arrowdown')) c.y += s * dt;
      G.clampCamera();
    }
  };
})();
