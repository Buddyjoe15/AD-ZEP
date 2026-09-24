import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src/Groundfall_Master_v0_7_0.html");
const html = fs.readFileSync(sourcePath, "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
if (!scripts.length) throw new Error("No inline scripts found in canonical master");
let parsed = 0;
for (let i = 0; i < scripts.length; i++) {
  try {
    new vm.Script(scripts[i], { filename: `Groundfall_Master_v0_7_0.html#script-${i + 1}` });
    parsed++;
  } catch (error) {
    console.error(`Inline script ${i + 1} failed JavaScript parse validation`);
    throw error;
  }
}
const harnessFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith(".mjs")) harnessFiles.push(p);
  }
}
for (const rel of ["scripts", "contracts", "tests"]) walk(path.join(root, rel));
for (const file of harnessFiles) {
  const checked = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  if (checked.status !== 0) throw new Error(`Node syntax check failed for ${path.relative(root, file)}\n${checked.stderr}`);
}
console.log(JSON.stringify({ pass: true, source: "src/Groundfall_Master_v0_7_0.html", inlineScriptsParsed: parsed, harnessModulesChecked: harnessFiles.length }, null, 2));
