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
// Simulation layer must stay DOM-free so it runs headless, and deterministic: wall-clock
// time comes only from the injected GW.Clock (diagnostics and save timestamps), and
// randomness only from the seeded GW.RNG / GW.hashRandom.
const NONDETERMINISM = [
  [/\bDate\s*\.\s*now\b/, 'Date.now'], [/\bperformance\s*\.\s*now\b/, 'performance.now'],
  [/\bnew\s+Date\b/, 'new Date'], [/\bMath\s*\.\s*random\b/, 'Math.random']
];
for (const f of scripts.filter(s => /^src\/(core|data|world|sim)\//.test(s))){
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  if (/\b(document|window|localStorage)\s*\./.test(code.replace(/typeof (document|window|localStorage)/g, ''))) {
    if (!/^src\/(sim\/save|core\/namespace)\.js$/.test(f)) problems.push('DOM access in simulation file: ' + f);
  }
  for (const [re, name] of NONDETERMINISM){
    if (re.test(code)) problems.push(`${name} in simulation file ${f}: use GW.RNG / GW.hashRandom for randomness and GW.Clock for timings`);
  }
}
// CLAUDE.md and AGENTS.md carry the same save format and parallel branch rules for AI contributors.
// A section runs from its "## " heading to the next one.
const section = (f, title) => {
  const t = fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '';
  const i = t.indexOf('\n## ' + title + '\n');
  if (i < 0) return null;
  const j = t.indexOf('\n## ', i + 1);
  return t.slice(i, j < 0 ? undefined : j).trim();
};
for (const title of ['Save format rules', 'Parallel branches']){
  if (!section('CLAUDE.md', title)) problems.push(`CLAUDE.md is missing its "## ${title}" section`);
  else if (section('CLAUDE.md', title) !== section('AGENTS.md', title)) problems.push(`The "${title}" sections of CLAUDE.md and AGENTS.md differ; keep them identical`);
}
try { loadSim(); } catch (e){ problems.push('simulation failed to load: ' + e.message); }

if (problems.length){ console.error(problems.join('\n')); process.exit(1); }
console.log(`OK — ${scripts.length} scripts, ${styles.length} stylesheets, simulation DOM-free and deterministic, content definitions consistent.`);
