// Bundles index.html and everything it links into one self-contained, offline HTML file.
// Usage: node tools/build.mjs [outfile]   (default dist/ad-ezp.html)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(ROOT, process.argv[2] || 'dist/ad-ezp.html');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let html = read('index.html');
let scripts = 0, styles = 0, assets = 0;
// Images and fonts become data: URIs, so the bundle stays one offline file.
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const dataUri = rel => { assets++; return `data:${MIME[path.extname(rel)]};base64,${fs.readFileSync(path.join(ROOT, rel)).toString('base64')}`; };
const inlineCssUrls = (css, from) => css.replace(/url\((?!data:)['"]?([^'")]+)['"]?\)/g, (_, u) => `url(${dataUri(path.join(path.dirname(from), u))})`);
html = html.replace(/<!-- Development entry point:[\s\S]*?-->\n?/, '');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  styles++;
  return `<style>/* ${href} */\n${inlineCssUrls(read(href), href)}\n</style>`;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  scripts++;
  // Keep a closing script tag inside a source string from terminating the block.
  return `<script>/* ${src} */\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`;
});
html = html.replace(/<img([^>]*) src="(?!data:)([^"]+)"/g, (_, pre, src) => `<img${pre} src="${dataUri(src)}"`);
if (/<(script|link|img)[^>]+(src|href)="(?!data:)/.test(html)) throw new Error('Unresolved external reference left in bundle');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(ROOT, out)} — ${scripts} scripts, ${styles} stylesheets, ${assets} assets, ${(html.length / 1024).toFixed(0)} KB`);
