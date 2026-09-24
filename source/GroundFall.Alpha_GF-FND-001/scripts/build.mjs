import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config/baseline.json"), "utf8"));
const src = path.join(root, "src", config.source_artifact);
const dist = path.join(root, "dist");
const out = path.join(dist, config.source_artifact);
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const bytes = fs.readFileSync(src);
fs.writeFileSync(out, bytes);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const manifest = {
  project_id: config.project_id,
  task_id: config.task_id,
  baseline_id: config.baseline_id,
  source_artifact: config.source_artifact,
  source_version: config.source_version,
  packaged_sha256: sha256,
  packaged_bytes: bytes.length,
  packaging: "byte-preserving standalone HTML copy",
  external_runtime_dependencies: []
};
fs.writeFileSync(path.join(dist, "BUILD_MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
