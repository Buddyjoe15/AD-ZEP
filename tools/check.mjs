// Static checks with no dependencies: every file referenced by index.html exists and
// parses, every source file is referenced, and content definitions are consistent.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, scriptOrder, loadSim } from '../tests/harness.mjs';

const problems = [];
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = scriptOrder();
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);

for (const f of [...scripts, ...styles]) if (!fs.existsSync(path.join(ROOT, f))) problems.push('missing file: ' + f);
for (const f of scripts){
  try { new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }); }
  catch (e){ problems.push(`syntax error in ${f}: ${e.message}`); }
}
const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name).split(path.sep).join('/')]);
for (const f of walk('src')){
  if (f.endsWith('.js') && !scripts.includes(f)) problems.push('source file not loaded by index.html: ' + f);
  if (f.endsWith('.css') && !styles.includes(f)) problems.push('stylesheet not linked by index.html: ' + f);
}
// Simulation layer must stay DOM-free so it runs headless.
for (const f of scripts.filter(s => /^src\/(core|data|world|sim)\//.test(s))){
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  if (/\b(document|window|localStorage)\s*\./.test(code.replace(/typeof (document|window|localStorage)/g, ''))) {
    if (!/^src\/(sim\/save|core\/namespace)\.js$/.test(f)) problems.push('DOM access in simulation file: ' + f);
  }
}
try { loadSim(); } catch (e){ problems.push('simulation failed to load: ' + e.message); }

if (problems.length){ console.error(problems.join('\n')); process.exit(1); }
console.log(`OK — ${scripts.length} scripts, ${styles.length} stylesheets, content definitions consistent.`);
