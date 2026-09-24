import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  WORLD_GEOMETRY_BASELINE,
  FOUNDATION_RUNTIME_METRIC_KEYS,
  assertFoundationProvider
} from "../contracts/platform-foundation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetArg = process.argv[2];
const outputArg = process.argv[3];
if (!targetArg || !outputArg) {
  console.error("Usage: node scripts/browser-smoke.mjs <html-path> <evidence-json>");
  process.exit(2);
}
const targetPath = path.resolve(root, targetArg);
const outputPath = path.resolve(root, outputArg);
if (!fs.existsSync(targetPath)) throw new Error(`Target does not exist: ${targetPath}`);

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(err => err ? reject(err) : resolve(port));
    });
  });
}

async function fetchJson(url, timeoutMs = 10000) {
  const started = performance.now();
  let lastError;
  while (performance.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out fetching ${url}: ${lastError?.message || "no response"}`);
}

class CDP {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP websocket open timeout")), 10000);
      this.ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener("error", event => { clearTimeout(timer); reject(new Error(`CDP websocket error: ${event.message || "unknown"}`)); }, { once: true });
    });
    this.ws.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
        else pending.resolve(message.result);
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (response.exceptionDetails) {
      throw new Error(`Browser evaluation failed: ${response.exceptionDetails.text || "exception"}`);
    }
    return response.result?.value;
  }
  close() {
    try { this.ws?.close(); } catch {}
  }
}

async function waitFor(cdp, expression, timeoutMs = 10000, label = expression) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    try {
      if (await cdp.evaluate(expression)) return performance.now() - started;
    } catch {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const chromium = process.env.CHROMIUM || "/usr/bin/chromium";
const port = await freePort();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "groundfall-gf-fnd-001-"));
const browserStarted = performance.now();
let stderr = "";
const chrome = spawn(chromium, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
  "--no-first-run",
  "--allow-file-access-from-files",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: ["ignore", "ignore", "pipe"] });
chrome.stderr.setEncoding("utf8");
chrome.stderr.on("data", chunk => { stderr += chunk; if (stderr.length > 20000) stderr = stderr.slice(-20000); });

let cdp;
let result;
try {
  const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
  const pages = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const page = pages.find(item => item.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("No Chromium page debugging target found");
  cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Log.enable");

  const targetUrl = pathToFileURL(targetPath).href;
  const navigationStarted = performance.now();
  await cdp.send("Page.navigate", { url: targetUrl });
  await waitFor(cdp, "typeof GW !== 'undefined' && GW.SceneManager && GW.SceneManager.currentName === 'mainMenu' && !!document.querySelector('[data-home=\"new\"]')", 15000, "GroundFall main menu");
  const pageStartupMs = performance.now() - navigationStarted;
  const processStartupMs = performance.now() - browserStarted;

  const initial = await cdp.evaluate(`(() => ({
    scene: GW.SceneManager.currentName,
    menuVisible: !document.getElementById('mainMenuOverlay').classList.contains('hidden'),
    config: {
      columns: GW.CONFIG.COLS,
      rows: GW.CONFIG.ROWS,
      tileWorldPixels: GW.CONFIG.TILE,
      widthWorldPixels: GW.CONFIG.WORLD_W,
      heightWorldPixels: GW.CONFIG.WORLD_H,
      fixedDt: GW.CONFIG.FIXED_DT
    },
    save: {
      version: GW.CONFIG.VERSION,
      prefix: GW.Save.prefix,
      legacyPrefix: GW.Save.legacyPrefix
    }
  }))()`);

  await cdp.evaluate("document.querySelector('[data-home=\"new\"]').click(); true");
  await waitFor(cdp, "!!document.querySelector('[data-new-slot=\"1\"]')", 5000, "new-game slot picker");
  await cdp.evaluate("document.querySelector('[data-new-slot=\"1\"]').click(); true");
  await waitFor(cdp, "!!document.querySelector('[data-character]')", 5000, "character picker");
  await cdp.evaluate("document.querySelector('[data-character]').click(); true");
  await waitFor(cdp, "GW.SceneManager.currentName === 'wormhole'", 5000, "wormhole scene");
  await cdp.evaluate("document.getElementById('introSkipBtn').click(); true");
  await waitFor(cdp, "GW.SceneManager.currentName === 'gameplay'", 5000, "gameplay scene");

  await sleep(350);
  const timing = await cdp.evaluate(`(() => {
    const dt = GW.CONFIG.FIXED_DT;
    const steps = GW.State.time / dt;
    return { time: GW.State.time, dt, steps, nearestStepError: Math.abs(steps - Math.round(steps)) };
  })()`);

  const renderInvariant = await cdp.evaluate(`(() => {
    GW.State.paused = true;
    const before = GW.State.time;
    for (let i = 0; i < 20; i++) GW.SceneManager.render(performance.now());
    const after = GW.State.time;
    return { before, after, unchanged: before === after };
  })()`);

  const runtime = await cdp.evaluate(`(() => ({
    scene: GW.SceneManager.currentName,
    config: {
      columns: GW.CONFIG.COLS,
      rows: GW.CONFIG.ROWS,
      tileWorldPixels: GW.CONFIG.TILE,
      widthWorldPixels: GW.CONFIG.WORLD_W,
      heightWorldPixels: GW.CONFIG.WORLD_H
    },
    metrics: { ...GW.State.metrics },
    state: {
      paused: GW.State.paused,
      time: GW.State.time,
      units: GW.State.units.length,
      containers: GW.State.containers.length
    },
    saveDataVersion: GW.Save.makeData().version,
    userAgent: navigator.userAgent
  }))()`);

  const realProvider = {
    getConfigSnapshot: () => runtime.config,
    getRuntimeMetrics: () => runtime.metrics
  };
  let contractConformance = true;
  let contractError = null;
  try { assertFoundationProvider(realProvider); } catch (error) { contractConformance = false; contractError = error.message; }

  const runtimeExceptions = cdp.events
    .filter(event => event.method === "Runtime.exceptionThrown")
    .map(event => event.params?.exceptionDetails?.text || "Runtime.exceptionThrown");
  const logErrors = cdp.events
    .filter(event => event.method === "Log.entryAdded" && ["error", "warning"].includes(event.params?.entry?.level))
    .map(event => ({ level: event.params.entry.level, text: event.params.entry.text }));

  const checks = {
    directFileLaunchReachedMainMenu: initial.scene === "mainMenu" && initial.menuVisible,
    mainMenuReachedGameplay: runtime.scene === "gameplay",
    fixedStepIsOneThirtieth: Math.abs(initial.config.fixedDt - 1 / 30) < 1e-12,
    simulationTimeUsesFixedStepQuantum: timing.nearestStepError < 1e-8,
    renderDoesNotAdvanceSimulationTimeWhenPaused: renderInvariant.unchanged,
    worldGeometryPreserved: Object.entries(WORLD_GEOMETRY_BASELINE).every(([key, value]) => runtime.config[key] === value),
    saveVersionPreserved: initial.save.version === "0.7.0" && runtime.saveDataVersion === "0.7.0",
    savePrefixesPreserved: initial.save.prefix === "groundfall-master-save-slot-" && initial.save.legacyPrefix === "groundfall-save-slot-",
    foundationContractConforms: contractConformance,
    runtimeMetricKeysPresent: FOUNDATION_RUNTIME_METRIC_KEYS.every(key => key in runtime.metrics),
    noCapturedRuntimeExceptions: runtimeExceptions.length === 0
  };

  result = {
    pass: Object.values(checks).every(Boolean),
    workload: "GF-FND-001 headless Chromium direct-file smoke: main menu -> new slot -> first character -> skip intro -> gameplay; then pause and render invariant check",
    target: path.relative(root, targetPath),
    targetSha256: sha256(fs.readFileSync(targetPath)),
    chromium: version.Browser,
    processStartupMs,
    pageStartupMs,
    checks,
    initial,
    timing,
    renderInvariant,
    runtime,
    contractError,
    runtimeExceptions,
    logErrors,
    limitations: [
      "Headless Chromium is not physical-device evidence.",
      "This smoke does not establish touch gesture quality, audio quality, gameplay balance, or sustained 512x512 performance.",
      "updateMs is captured as exposed by v0.7.0 but the inspected source does not visibly assign it."
    ]
  };
} catch (error) {
  result = {
    pass: false,
    target: path.relative(root, targetPath),
    error: error.stack || String(error),
    chromiumStderrTail: stderr.slice(-8000)
  };
} finally {
  cdp?.close();
  chrome.kill("SIGTERM");
  await sleep(100);
  if (!chrome.killed) chrome.kill("SIGKILL");
  fs.rmSync(profile, { recursive: true, force: true });
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exit(1);
