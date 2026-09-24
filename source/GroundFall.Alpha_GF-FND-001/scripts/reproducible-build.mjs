import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = process.argv[2] ? path.resolve(root, process.argv[2]) : null;

function runBuild() {
  const r = spawnSync(process.execPath, [path.join(root, "scripts/build.mjs")], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Build failed: ${r.stderr || r.stdout}`);
}
function snapshot(dir) {
  const result = {};
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (!fs.statSync(p).isFile()) continue;
    const bytes = fs.readFileSync(p);
    result[name] = { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  }
  return result;
}
runBuild();
const first = snapshot(path.join(root, "dist"));
runBuild();
const second = snapshot(path.join(root, "dist"));
const result = { pass: JSON.stringify(first) === JSON.stringify(second), first, second };
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
}
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exit(1);
