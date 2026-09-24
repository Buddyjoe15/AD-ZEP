import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config/baseline.json"), "utf8"));
const baselinePath = path.join(root, "baseline", config.source_artifact);
const bytes = fs.readFileSync(baselinePath);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const result = {
  projectId: config.project_id,
  taskId: config.task_id,
  baselineId: config.baseline_id,
  artifact: path.relative(root, baselinePath),
  expectedSha256: config.source_sha256,
  actualSha256: sha256,
  expectedBytes: config.source_bytes,
  actualBytes: bytes.length,
  pass: sha256 === config.source_sha256 && bytes.length === config.source_bytes
};
if (!result.pass) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));
