/* Items, the Commander's backpack and equipment, and world containers.
   Item instances are { id, key, durability, maxDurability, count }. Everything else
   (name, slot, effects, description) is read from the item definition. */
(function(){
  'use strict';
  const G = GW;
  const PAIRS = { arms: ['leftArm', 'rightArm'], hands: ['leftHand', 'rightHand'], legs: ['leftLeg', 'rightLeg'], feet: ['leftFoot', 'rightFoot'] };

  G.Items = {
    def(item){ return item && G.Defs.items.get(item.key); },
    create(key, count = 1){
      const d = G.Defs.items.require(key);
      const it = { id: 'item-' + G.newId(), key };
      if (d.stackable) it.count = Math.max(1, Math.min(d.maxStack, count | 0));
      else { it.durability = d.maxDurability; it.maxDurability = d.maxDurability; }
      return it;
    },
    name(item){ return this.def(item)?.name || item.key; },
    label(item){ return this.name(item) + (item.count > 1 ? ' ×' + item.count : ''); },
    effects(item){
      const d = this.def(item);
      if (!d || (!d.stackable && !(item.durability > 0))) return {};
      return d.effects;
    },
    // True when `item` fits entirely (free slot, or enough room in matching stacks).
    fits(list, capacity, item){
      if (list.length < capacity) return true;
      const d = this.def(item);
      if (!d || !d.stackable) return false;
      let room = 0;
      for (const o of list) if (o.key === item.key) room += d.maxStack - o.count;
      return room >= item.count;
    },
    // Merges `item` into matching stacks in `list` (up to capacity slots). Returns the
    // remainder that did not fit, or null when everything was stored.
    store(list, capacity, item){
      const d = this.def(item);
      if (d && d.stackable){
        for (const other of list){
          if (other.key !== item.key || other.count >= d.maxStack) continue;
          const move = Math.min(d.maxStack - other.count, item.count);
          other.count += move; item.count -= move;
          if (item.count <= 0) return null;
        }
      }
      if (list.length >= capacity) return item;
      list.push(item);
      return null;
    }
  };

  const inv = () => G.State.inventory;
  const changed = () => G.Events.emit('inventory:changed');

  G.Inventory = {
    baseCapacity: 10,
    get items(){ return inv().items; },
    get equipment(){ return inv().equipment; },
    capacity(){
      let bonus = 0;
      for (const it of Object.values(inv().equipment)) if (it) bonus += G.Items.effects(it).inventoryBonus || 0;
      return this.baseCapacity + bonus;
    },
    canAdd(item){ return item ? G.Items.fits(inv().items, this.capacity(), item) : inv().items.length < this.capacity(); },
    add(item){
      if (!this.canAdd(item)) return false;
      const rest = G.Items.store(inv().items, this.capacity(), item);
      changed();
      return rest === null;
    },
    spawn(key){
      if (!G.Defs.items.has(key)) return false;
      const item = G.Items.create(key);
      if (!this.add(item)){ G.notify('Backpack is full'); return false; }
      G.notify(G.Items.name(item) + ' added to backpack');
      return true;
    },
    slotAccepts(item, target){
      const d = G.Items.def(item);
      if (!d || !target || !(target in inv().equipment)) return false;
      return d.slot === target || !!(PAIRS[d.slot] && PAIRS[d.slot].includes(target));
    },
    equip(itemId, target = null){
      const I = inv(), i = I.items.findIndex(x => x.id === itemId);
      if (i < 0) return false;
      const item = I.items[i], d = G.Items.def(item);
      if (!d || !d.slot){ G.notify('That item cannot be equipped'); return false; }
      if (!target) target = PAIRS[d.slot] ? (I.equipment[PAIRS[d.slot][0]] ? PAIRS[d.slot][1] : PAIRS[d.slot][0]) : d.slot;
      if (!this.slotAccepts(item, target)){ G.notify('That item cannot be equipped there'); return false; }
      const old = I.equipment[target];
      I.items.splice(i, 1);
      if (old) I.items.push(old);
      I.equipment[target] = item;
      changed();
      return true;
    },
    unequip(slot){
      const I = inv(), item = I.equipment[slot];
      if (!item) return false;
      // Removing a backpack must not strand items beyond the reduced capacity.
      const after = this.capacity() - (G.Items.effects(item).inventoryBonus || 0);
      if (I.items.length + 1 > after){ G.notify('Backpack is full'); return false; }
      I.equipment[slot] = null; I.items.push(item);
      changed();
      return true;
    },
    damageReduction(){
      let n = 0;
      for (const it of Object.values(inv().equipment)) if (it) n += G.Items.effects(it).damageReduction || 0;
      return Math.min(0.65, n);
    },
    // Wears one random piece of armour that is currently providing protection.
    wearArmor(amount, rnd = Math.random){
      const worn = Object.values(inv().equipment).filter(it => it && it.durability > 0 && G.Items.effects(it).damageReduction);
      if (!worn.length) return;
      const it = worn[(rnd() * worn.length) | 0];
      it.durability = Math.max(0, it.durability - amount);
      changed();
    },
    takeFromContainer(c, itemId){
      if (!c || !c.opened) return false;
      if (c.type === 'ground_item'){
        const h = G.Units.hero();
        if (!h || !G.within(h, c, G.CONFIG.INTERACT_RANGE)){ G.notify('Move Commander Vance closer to the item'); return false; }
      }
      const i = c.items.findIndex(x => x.id === itemId);
      if (i < 0) return false;
      if (!this.canAdd(c.items[i])){ G.notify('Backpack is full'); return false; }
      const item = c.items.splice(i, 1)[0];
      this.add(item);
      G.notify(G.Items.name(item) + ' added to backpack');
      G.Events.emit('container:changed', c);
      return true;
    },
    giveToContainer(c, itemId){
      if (!c || !c.opened) return false;
      const I = inv(), i = I.items.findIndex(x => x.id === itemId);
      if (i < 0) return false;
      const item = I.items[i];
      if (!G.Items.fits(c.items, c.capacity, item)){ G.notify('Storage is full'); return false; }
      I.items.splice(i, 1);
      G.Items.store(c.items, c.capacity, item);
      G.notify(G.Items.name(item) + ' moved to storage');
      changed(); G.Events.emit('container:changed', c);
      return true;
    }
  };

  G.Containers = {
    SEARCH_SECONDS: 3,
    create(x, y, items = [], opts = {}){
      const T = G.CONFIG.TILE;
      const c = {
        id: 'chest-' + G.newId(), type: opts.type || 'chest', name: opts.name || 'Chest', x, y,
        gx: opts.gx != null ? opts.gx : Math.floor(x / T), gy: opts.gy != null ? opts.gy : Math.floor(y / T),
        opened: !!opts.opened, built: !!opts.built, capacity: opts.capacity || 24, items: [...items]
      };
      if (opts.testZone) c.testZone = true;
      G.State.containers.push(c);
      return c;
    },
    groundItem(x, y, item, opts = {}){
      return this.create(x, y, [item], { ...opts, type: 'ground_item', opened: true, name: G.Items.name(item), capacity: 1 });
    },
    begin(c){
      const h = G.Units.hero();
      if (!h || !c || c.opened) return false;
      if (!G.within(h, c, G.CONFIG.INTERACT_RANGE)){ G.notify('Move Commander Vance closer to the chest'); return false; }
      G.State.searching = { containerId: c.id, remaining: this.SEARCH_SECONDS, total: this.SEARCH_SECONDS };
      G.Events.emit('container:changed', c);
      return true;
    },
    get(id){ return G.State.containers.find(c => c.id === id) || null; },
    update(dt){
      const S = G.State, q = S.searching;
      if (!q) return;
      const h = G.Units.hero(), c = this.get(q.containerId);
      if (!h || !c || !G.within(h, c, G.CONFIG.SEARCH_CANCEL_RANGE)){
        S.searching = null; G.notify('Search cancelled'); G.Events.emit('container:changed', c); return;
      }
      q.remaining -= dt;
      if (q.remaining <= 0){
        c.opened = true; S.searching = null;
        G.notify(c.items.length ? `Container opened — ${c.items.length} item${c.items.length !== 1 ? 's' : ''} found` : 'Container is empty');
        G.Events.emit('container:opened', c);
      }
      G.Events.emit('container:changed', c);
    },
    // Removes empty picked-up ground items.
    sweep(){
      const S = G.State;
      if (S.containers.some(c => c.type === 'ground_item' && !c.items.length)) S.containers = S.containers.filter(c => !(c.type === 'ground_item' && !c.items.length));
    }
  };
  G.SystemManager.register('containers', { update(dt){ G.Containers.update(dt); } });
})();
