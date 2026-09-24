// Loads the DOM-free simulation layer (src/core, src/data, src/world, src/sim) into an
// isolated VM context, in the same order index.html uses. No browser required.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM_DIRS = /^src\/(core|data|world|sim)\//;

export function scriptOrder(){
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
}

export function loadSim({ quiet = true } = {}){
  const context = {
    console: quiet ? { log(){}, warn(){}, error(){}, info(){} } : console,
    performance, setTimeout, clearTimeout, structuredClone
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of scriptOrder().filter(f => SIM_DIRS.test(f))){
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  const G = context.GW;
  G.Defs.verify();
  return G;
}

// Starts a fresh expedition with the simulation running.
export function newGame(seed = 72491){
  const G = loadSim();
  G.Scenario.newGame({ seed, slot: 1 });
  G.State.paused = false;
  return G;
}
