/* Stockpile economy. All resource changes go through here so every gain and spend is
   recorded in a rolling one-minute ledger (income / expense rates per resource) and
   announced on the event bus. */
(function(){
  'use strict';
  const G = GW;
  const WINDOW = 60;

  function ledger(){
    const S = G.State;
    if (!S.ledger) S.ledger = { second: 0, flows: {} };
    return S.ledger;
  }
  function flow(key){
    const L = ledger();
    return L.flows[key] || (L.flows[key] = { income: new Array(WINDOW).fill(0), expense: new Array(WINDOW).fill(0) });
  }
  function record(key, amount){
    const f = flow(key), slot = ledger().second % WINDOW;
    if (amount >= 0) f.income[slot] += amount; else f.expense[slot] -= amount;
  }
  const changed = () => G.Events.emit('economy:changed', { ...G.State.resources });

  G.Economy = {
    get(key){ return Number(G.State.resources[key] || 0); },
    set(key, value){ G.State.resources[key] = G.round6(Math.max(0, value)); changed(); },
    canAfford(cost = {}){ return Object.entries(cost).every(([k, v]) => this.get(k) >= v); },
    spend(cost = {}, reason = ''){
      if (!this.canAfford(cost)) return false;
      for (const [k, v] of Object.entries(cost)){ if (!v) continue; G.State.resources[k] = G.round6(this.get(k) - v); record(k, -v); }
      G.Events.emit('economy:spent', { cost, reason });
      changed();
      return true;
    },
    add(key, amount, reason = ''){
      if (!G.isNum(amount) || amount === 0) return;
      G.State.resources[key] = G.round6(Math.max(0, this.get(key) + amount));
      record(key, amount);
      G.Events.emit('economy:gained', { key, amount, reason });
      changed();
    },
    refund(cost = {}, reason = 'refund'){ for (const [k, v] of Object.entries(cost)) if (v) this.add(k, v, reason); },
    describe(cost = {}){
      const parts = Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${(G.Defs.resources.get(k)?.name || k).toLowerCase()}`);
      return parts.join(' + ') || 'Free';
    },
    shortfall(cost = {}){
      return Object.entries(cost).filter(([k, v]) => this.get(k) < v).map(([k, v]) => `${Math.ceil(v - this.get(k))} ${G.Defs.resources.get(k)?.name.toLowerCase() || k}`).join(', ');
    },
    // Per-minute income / expense averaged over the last minute of play.
    rate(key){
      const f = ledger().flows[key];
      if (!f) return { income: 0, expense: 0, net: 0 };
      const income = f.income.reduce((a, b) => a + b, 0), expense = f.expense.reduce((a, b) => a + b, 0);
      return { income, expense, net: income - expense };
    },
    // Advances the ledger clock; clears buckets as the one-minute window rolls forward.
    tick(){
      const L = ledger(), sec = Math.floor(G.State.time);
      while (L.second < sec){
        L.second++;
        const slot = L.second % WINDOW;
        for (const f of Object.values(L.flows)){ f.income[slot] = 0; f.expense[slot] = 0; }
        if (sec - L.second > WINDOW) L.second = sec - WINDOW;
      }
    }
  };
  G.SystemManager.register('economy', { update(){ G.Economy.tick(); } });
})();
