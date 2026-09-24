// Bundles index.html and everything it links into one self-contained, offline HTML file.
// Usage: node tools/build.mjs [outfile]   (default dist/ad-ezp.html)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(ROOT, process.argv[2] || 'dist/ad-ezp.html');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let html = read('index.html');
let scripts = 0, styles = 0;
html = html.replace(/<!-- Development entry point:[\s\S]*?-->\n?/, '');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  styles++;
  return `<style>/* ${href} */\n${read(href)}\n</style>`;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  scripts++;
  // Keep a closing script tag inside a source string from terminating the block.
  return `<script>/* ${src} */\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`;
});
if (/<(script|link)[^>]+(src|href)="(?!data:)/.test(html)) throw new Error('Unresolved external reference left in bundle');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(ROOT, out)} — ${scripts} scripts, ${styles} stylesheets, ${(html.length / 1024).toFixed(0)} KB`);
