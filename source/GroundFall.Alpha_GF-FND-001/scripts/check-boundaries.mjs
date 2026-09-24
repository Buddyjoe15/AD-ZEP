import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config/dependency-boundaries.json"), "utf8"));
const codeExt = new Set([".js", ".mjs", ".cjs"]);
const importPattern = /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+|import\s*\()\s*["']([^"']+)["']/g;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (codeExt.has(path.extname(entry.name))) out.push(p);
  }
  return out;
}

function normalizedTarget(file, specifier) {
  if (!specifier.startsWith(".")) return specifier;
  return path.relative(root, path.resolve(path.dirname(file), specifier)).replaceAll(path.sep, "/");
}

const violations = [];
const scanned = [];
for (const relRoot of [...config.contractRoots, ...config.platformRoots]) {
  for (const file of walk(path.join(root, relRoot))) {
    scanned.push(path.relative(root, file).replaceAll(path.sep, "/"));
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(importPattern)) {
      const specifier = match[1];
      const target = normalizedTarget(file, specifier);
      const rel = path.relative(root, file).replaceAll(path.sep, "/");
      if (config.contractRoots.some(r => rel.startsWith(r)) && target.startsWith("src/")) {
        violations.push({ file: rel, specifier, rule: "contract-imports-implementation" });
      }
      if (config.platformRoots.some(r => rel.startsWith(r)) && config.specialistPrivateRoots.some(r => target.startsWith(r))) {
        violations.push({ file: rel, specifier, rule: "platform-imports-specialist-private" });
      }
    }
  }
}

const result = { pass: violations.length === 0, scanned, violations };
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exit(1);
