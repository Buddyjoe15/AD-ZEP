// Browser tests with real mouse, keyboard and touch input against both the development page
// (index.html) and the single-file build (dist/ad-ezp.html).
// Needs Playwright + Chromium. Resolution order: `playwright` package, PLAYWRIGHT_MODULE,
// then the global npm install. CHROMIUM_PATH selects a browser binary. Skips when absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT } from './harness.mjs';

const require = createRequire(import.meta.url);
function loadPlaywright(){
  const tries = ['playwright', process.env.PLAYWRIGHT_MODULE];
  try { tries.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e){ /* no npm */ }
  for (const t of tries.filter(Boolean)){ try { return require(t); } catch (e){ /* next */ } }
  return null;
}
const pw = loadPlaywright();
const OUT = path.join(ROOT, 'tests/output');
const skip = pw ? false : 'Playwright is not installed';

async function launch(){
  return pw.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
}
// Messages from Chromium's software GPU emulator (only used when forced in tests) are
// driver notices, not game errors.
const EMULATOR_NOISE = /GL Driver Message|swiftshader|GroupMarkerNotSet/i;
function track(page){
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !EMULATOR_NOISE.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
  return errors;
}
const screen = (page, x, y) => page.evaluate(([x, y]) => GW.screenFromWorld(x, y), [x, y]);
async function startGame(page, url){
  if (process.env.RENDERER && !url.includes('?')) url += '?renderer=' + process.env.RENDERER;
  await page.goto(url);
  await page.waitForFunction(() => GW.SceneManager.currentName === 'mainMenu');
  await page.click('[data-home="new"]');
  await page.click('[data-new-slot="1"]');
  if (await page.$('#confirmOverwriteBtn')) await page.click('#confirmOverwriteBtn');
  await page.fill('#ezSeedInput', '72491');
  await page.click('#launchVance');
  await page.click('#introSkipBtn');
  await page.waitForFunction(() => GW.SceneManager.currentName === 'gameplay' && !GW.State.introCamera, null, { timeout: 8000 });
  await page.waitForTimeout(1500);   // disembark
}

for (const target of ['index.html', 'dist/ad-ezp.html']){
  test(`desktop play-through (${target})`, { skip, timeout: 120000 }, async () => {
    if (target.startsWith('dist')) execSync('node tools/build.mjs', { cwd: ROOT });
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
      const errors = track(page);
      await startGame(page, pathToFileURL(path.join(ROOT, target)).href);
      const tag = target.startsWith('dist') ? 'dist' : 'dev';

      // Selecting the ship opens its fabrication window; queue a drone by clicking.
      const ship = await page.evaluate(() => { const s = GW.Units.ship(); return { x: s.x, y: s.y }; });
      let p = await screen(page, ship.x, ship.y);
      await page.mouse.click(p.x, p.y);
      await page.waitForSelector('#ezFabrication:not(.hidden)');
      await page.waitForTimeout(120);
      await page.click('#ezFabrication [data-arg="survey_drone"]');
      assert.equal(await page.evaluate(() => GW.Units.ship().fabQueue.length), 1);
      await page.screenshot({ path: path.join(OUT, `${tag}-fabrication.png`) });
      await page.click('#ezFabClose');

      // Select Vance and right-click to move.
      const hero = await page.evaluate(() => { const h = GW.Units.hero(); return { x: h.x, y: h.y }; });
      p = await screen(page, hero.x, hero.y);
      await page.mouse.click(p.x, p.y);
      assert.ok(await page.evaluate(() => GW.State.selected.has(GW.State.heroId)));
      await page.mouse.click(p.x + 160, p.y + 60, { button: 'right' });
      await page.waitForTimeout(600);
      const moved = await page.evaluate(([x, y]) => Math.hypot(GW.Units.hero().x - x, GW.Units.hero().y - y), [hero.x, hero.y]);
      assert.ok(moved > 20, 'Vance moved ' + moved);

      // Select the Utility Spider, open Build, place a wall with a click.
      const spider = await page.evaluate(() => { const u = GW.State.units.find(u => u.type === 'utility_spider'); return { x: u.x, y: u.y }; });
      p = await screen(page, spider.x, spider.y);
      await page.mouse.click(p.x, p.y);
      await page.click('#truckBuildBtn');
      await page.click('[data-build-pick="wall"]');
      const tile = await page.evaluate(() => { const u = GW.State.units.find(u => u.type === 'utility_spider'), T = 48, g = GW.State.grid;
        for (let r = 3; r < 9; r++) for (let dx = -r; dx <= r; dx++){ const x = Math.floor(u.x / T) + dx, y = Math.floor(u.y / T) + r; if (GW.Buildings.canPlace(x, y, 1, 1)) return { x: (x + 0.5) * T, y: (y + 0.5) * T }; } });
      p = await screen(page, tile.x, tile.y);
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.evaluate(() => GW.State.constructionSites.length), 1);

      // The Spider panel shows storage out of 25.
      assert.match(await page.textContent('#selectionPanel'), /Storage\s*0 \/ 25/);
      // Place a Mine Building from the build menu: clicking beside a deposit snaps it on.
      const dep = await page.evaluate(() => { const n = GW.State.resourceNodes.filter(n => n.type === 'metal_mine' && !GW.Gather.mineOn(n))
        .sort((a, b) => GW.dist2(a, GW.Units.ship()) - GW.dist2(b, GW.Units.ship()))[0]; GW.centerCamera(n.x, n.y); GW.State.resources.metal = 1000; return { x: n.x, y: n.y, gx: n.gx, gy: n.gy }; });
      await page.evaluate(() => { const u = GW.State.units.find(u => u.type === 'utility_spider'); GW.Orders.setCommand([u], 'idle'); GW.Selection.set([u.id]); });
      await page.click('#truckBuildBtn');
      await page.click('[data-build-pick="mine_building"]');
      p = await screen(page, dep.x + 30, dep.y + 20);
      await page.mouse.click(p.x, p.y);
      const site = await page.evaluate(() => GW.State.constructionSites.find(s => s.type === 'mine_building'));
      assert.ok(site, 'mine site queued');
      assert.deepEqual([site.gx, site.gy, site.w, site.h], [dep.gx - 1, dep.gy - 1, 3, 3], '3×3 centred on the 1×1 deposit');
      await page.screenshot({ path: path.join(OUT, `${tag}-mine-site.png`) });

      // Follow: select the Security Drone, press Follow, tap the Survey Drone.
      const units = await page.evaluate(() => { const g = GW.State.units.find(u => u.type === 'security_drone'), s = GW.State.units.find(u => u.type === 'survey_drone');
        GW.centerCamera((g.x + s.x) / 2, (g.y + s.y) / 2); GW.Selection.set([g.id]); return { sx: s.x, sy: s.y, sid: s.id, gid: g.id }; });
      await page.waitForSelector('#selectionPanel [data-unit-command="follow"]');
      assert.equal(await page.$('#selectionPanel [data-unit-command="follow"]:has-text("Follow Vance")'), null, 'no Follow Vance button');
      await page.click('#selectionPanel [data-unit-command="follow"]');
      p = await screen(page, units.sx, units.sy);
      await page.mouse.click(p.x, p.y);
      const f = await page.evaluate(id => { const u = GW.Units.get(id); return { command: u.command, followId: u.followId, sel: [...GW.State.selected] }; }, units.gid);
      assert.equal(f.command, 'follow'); assert.equal(f.followId, units.sid);
      assert.deepEqual(f.sel, [units.gid], 'choosing the target does not change the selection');
      assert.match(await page.textContent('#selectionPanel'), /Following Survey Drone/);
      await page.screenshot({ path: path.join(OUT, `${tag}-follow.png`) });

      // Box-select everyone with a drag.
      await page.evaluate(() => { const h = GW.Units.hero(); GW.centerCamera(h.x, h.y); });
      await page.mouse.move(20, 200); await page.mouse.down(); await page.mouse.move(1340, 880, { steps: 5 }); await page.mouse.up();
      assert.ok(await page.evaluate(() => GW.State.selected.size >= 4));

      // Expedition log renders and its actions work.
      await page.click('#ezToggle');
      await page.waitForSelector('#ezPanel:not(.hidden) .ezChecklist');
      assert.equal(await page.$('#ezPanel [data-ez="explore"], #ezPanel [data-ez="mine"], #ezPanel [data-ez="survey"]'), null, 'removed buttons stay gone');
      await page.click('#ezPanel [data-ez="recall"]');
      await page.screenshot({ path: path.join(OUT, `${tag}-expedition-log.png`) });
      await page.click('#ezToggle');

      // Inventory opens from the keyboard.
      await page.keyboard.press('i');
      await page.waitForSelector('#inventoryPanel:not(.hidden) .inventory-grid');
      await page.keyboard.press('i');

      // Debug catalog: arm a Sensor Station and place it.
      await page.click('#dbgBtn');
      await page.click('.dbgEntry:has-text("Sensor Station")');
      const before = await page.evaluate(() => GW.State.buildings.length);
      const spot = await page.evaluate(() => { const T = 48, g = GW.State.grid, c = GW.State.camera, R = GW.Renderer;
        for (let gy = Math.floor((c.y + 200 / c.z) / T); gy < (c.y + (R.h - 250) / c.z) / T; gy++) for (let gx = Math.floor((c.x + 420 / c.z) / T); gx < (c.x + (R.w - 420) / c.z) / T; gx++)
          if (GW.Buildings.canPlace(gx, gy, 2, 2)) return { x: gx * T + 10, y: gy * T + 10 }; });
      p = await screen(page, spot.x, spot.y);
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.evaluate(() => GW.State.buildings.length), before + 1);
      await page.click('#dbgClose');

      // Holding a pan key moves the camera and keeps it valid (regression: NaN camera).
      const cam0 = await page.evaluate(() => ({ ...GW.State.camera }));
      await page.keyboard.down('d'); await page.waitForTimeout(400); await page.keyboard.up('d');
      await page.keyboard.down('s'); await page.waitForTimeout(300); await page.keyboard.up('s');
      const cam1 = await page.evaluate(() => ({ ...GW.State.camera }));
      assert.ok(Number.isFinite(cam1.x) && Number.isFinite(cam1.y), 'camera stays finite');
      assert.ok(cam1.x - cam0.x > 100 && cam1.y - cam0.y > 50, `camera panned right and down (${cam1.x - cam0.x}, ${cam1.y - cam0.y})`);

      // Hostile Fabricator: click it, choose speed and amount, spawn.
      const hf = await page.evaluate(() => { const b = GW.State.buildings.find(b => b.type === 'hostile_fabricator'); GW.centerCamera(b.x, b.y, 0.72); return { x: b.x, y: b.y }; });
      p = await screen(page, hf.x, hf.y);
      await page.mouse.click(p.x, p.y);
      await page.waitForSelector('#spawnerPanel:not(.hidden) #spStart');
      await page.waitForTimeout(120);
      await page.click('#spawnerPanel [data-rate="250"]');
      await page.fill('#spAmount', '300'); await page.press('#spAmount', 'Enter'); await page.click('#spawnerPanel h2');
      await page.click('#spStart');
      await page.waitForFunction(() => GW.State.units.filter(u => u.spawnerId).length >= 300, null, { timeout: 15000 });
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => GW.State.units.filter(u => u.spawnerId).length), 300);
      assert.match(await page.textContent('#spLive'), /Complete · 300 \/ 300/);
      await page.screenshot({ path: path.join(OUT, `${tag}-spawner.png`) });
      await page.click('#spClear');
      assert.equal(await page.evaluate(() => GW.State.units.filter(u => u.spawnerId).length), 0);
      await page.click('#spClose');

      // Save and load through the game menu.
      await page.click('#menuBtn');
      await page.click('[data-menu-tab="saves"]');
      await page.click('[data-save-slot="2"]');
      await page.click('[data-load-slot="2"]');
      await page.waitForFunction(() => GW.SceneManager.currentName === 'gameplay' && !GW.State.paused);
      assert.equal(await page.evaluate(() => GW.State.activeSaveSlot), 2);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `${tag}-desktop.png`) });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}

test('touch controls on a phone-sized screen', { skip, timeout: 60000 }, async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = track(page);
    await startGame(page, pathToFileURL(path.join(ROOT, 'index.html')).href);
    const hero = await page.evaluate(() => { const h = GW.Units.hero(); GW.centerCamera(h.x, h.y); GW.Selection.clear(); return { x: h.x, y: h.y }; });
    let p = await screen(page, hero.x, hero.y);
    await page.touchscreen.tap(p.x, p.y);
    assert.ok(await page.evaluate(() => GW.State.selected.has(GW.State.heroId)), 'tap selects Vance');
    await page.waitForTimeout(400);   // not a double tap
    await page.touchscreen.tap(p.x + 120, p.y - 40);
    await page.waitForTimeout(500);
    const moved = await page.evaluate(([x, y]) => Math.hypot(GW.Units.hero().x - x, GW.Units.hero().y - y), [hero.x, hero.y]);
    assert.ok(moved > 15, 'tap on terrain moves Vance: ' + moved);
    // Drag on empty terrain pans the camera.
    const cam0 = await page.evaluate(() => ({ ...GW.State.camera }));
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', 600, 120);
    for (let i = 1; i <= 6; i++) await touch('touchMove', 600 - i * 30, 120 + i * 10);
    await touch('touchEnd');
    const cam1 = await page.evaluate(() => ({ ...GW.State.camera }));
    assert.ok(Math.abs(cam1.x - cam0.x) > 50, 'camera panned');
    // Ship tap opens fabrication above the fold without activating a recipe.
    const ship = await page.evaluate(() => { const s = GW.Units.ship(); return { x: s.x, y: s.y }; });
    await page.evaluate(([x, y]) => GW.centerCamera(x, y), [ship.x, ship.y]);
    p = await screen(page, ship.x, ship.y);
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForSelector('#ezFabrication:not(.hidden)');
    assert.equal(await page.evaluate(() => GW.Units.ship().fabQueue.length), 0, 'opening tap did not fabricate');
    const box = await page.$eval('#ezFabrication', el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
    assert.ok(box.left >= 0 && box.right <= 844 && box.bottom <= 390, 'fabrication window fits the screen');
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, 'mobile.png') });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('5,000 enemies swarm Vance at an interactive frame rate', { skip, timeout: 90000 }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const errors = track(page);
    await startGame(page, pathToFileURL(path.join(ROOT, 'index.html')).href);
    const r = await page.evaluate(async () => {
      const S = GW.State, h = GW.Units.hero(), N = 5000;
      for (const u of S.units) if (u.team === 'blue') u.maxHp = u.hp = 1e9;   // measure the swarm, not a defeat
      for (let i = 0; i < N; i++){
        const a = (i / N) * Math.PI * 2, rad = 1500 + (i % 25) * 40;
        const q = GW.openPoint(h.x + Math.cos(a) * rad, h.y + Math.sin(a) * rad, 0, 30);
        GW.Units.spawn('hostile_machine', q.x, q.y);
      }
      GW.rebuildSpatial();
      GW.centerCamera(h.x, h.y, 0.3);
      const t0 = performance.now();
      await new Promise(res => { const k = () => GW.Swarm.field && GW.Swarm.field.ready ? res() : setTimeout(k, 20); k(); });
      const fieldMs = performance.now() - t0;
      const d0 = S.units.filter(u => u.team === 'red').reduce((a, u) => a + Math.hypot(u.x - h.x, u.y - h.y), 0) / N;
      let frames = 0, worst = 0, last = performance.now(); const start = last;
      await new Promise(res => { const f = () => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; frames++; if (n - start < 6000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      const red = S.units.filter(u => u.team === 'red');
      const d1 = red.reduce((a, u) => a + Math.hypot(u.x - h.x, u.y - h.y), 0) / red.length;
      return { fps: frames / 6, worst, fieldMs, d0, d1, update: S.metrics.updateMs, draw: S.metrics.drawMs, queue: S.paths.length, units: S.units.length };
    });
    console.log(`    swarm: ${r.fps.toFixed(1)} fps (worst frame ${r.worst.toFixed(0)} ms), update ${r.update.toFixed(1)} ms, draw ${r.draw.toFixed(1)} ms, field built in ${r.fieldMs.toFixed(0)} ms, closed ${r.d0.toFixed(0)} → ${r.d1.toFixed(0)} px, path queue ${r.queue}`);
    await page.screenshot({ path: path.join(OUT, 'swarm.png') });
    // A frame-rate floor is only meaningful on the renderer the game picks by itself; a
    // forced WebGL run in CI uses a CPU-emulated GPU that fills every pixel in software.
    // Shared CI runners have no GPU at all, so page compositing alone costs them 40+ ms a
    // frame and wall-clock fps measures the runner. There, check the game's own work per
    // frame (simulation tick + drawing) against the 33 ms tick budget instead.
    if (process.env.CI) assert.ok(r.update + r.draw < 33, `update ${r.update.toFixed(1)} + draw ${r.draw.toFixed(1)} ms per frame`);
    else if (process.env.RENDERER !== 'gpu') assert.ok(r.fps > 20, 'frame rate ' + r.fps.toFixed(1));
    assert.ok(r.d1 < r.d0 - 250, 'the swarm advanced on Vance');
    assert.ok(r.queue < 200, 'no route-search backlog');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('GPU renderer draws every visible unit in one instanced pass', { skip, timeout: 60000 }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const errors = track(page);
    // Headless Chromium only has a software GPU, which the game normally refuses; force it.
    await startGame(page, pathToFileURL(path.join(ROOT, 'index.html')).href + '?renderer=gpu');
    const r = await page.evaluate(() => {
      const G = GW, S = G.State, h = G.Units.hero();
      S.paused = true;
      for (let i = 0; i < 400; i++){ const u = G.Units.spawn('hostile_machine', h.x - 300 + (i % 20) * 30, h.y - 400 + Math.floor(i / 20) * 30); u.heading = i; u.hp = 40; }
      G.rebuildSpatial(); G.centerCamera(h.x, h.y - 200, 0.6);
      G.Renderer.draw();
      const gl = G.GPU.gl, w = gl.drawingBufferWidth, hgt = gl.drawingBufferHeight, px = new Uint8Array(w * hgt * 4);
      gl.readPixels(0, 0, w, hgt, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let opaque = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 200) opaque++;
      return { ok: G.GPU.ok, sprites: S.metrics.gpuSprites, visible: S.metrics.visible, opaque, area: w * hgt };
    });
    assert.ok(r.ok, 'WebGL2 renderer active');
    assert.equal(r.sprites, r.visible - 1, 'every visible unit except the ship (drawn on the map layer) is a GPU sprite');
    assert.ok(r.opaque > r.sprites * 40, `units are visible on the GPU layer (${r.opaque} opaque px)`);
    await page.screenshot({ path: path.join(OUT, 'gpu.png') });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('old browser saves are backed up before upgrading; unloadable saves are reported, not loaded', { skip, timeout: 60000 }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = track(page);
    const url = pathToFileURL(path.join(ROOT, 'index.html')).href;
    const v1 = fs.readFileSync(path.join(ROOT, 'tests/fixtures/save-schema-1.json'), 'utf8');
    await page.goto(url);
    await page.waitForFunction(() => GW.SceneManager.currentName === 'mainMenu');
    await page.evaluate(v1 => {
      localStorage.clear();
      localStorage.setItem(GW.Save.keyFor(3), v1);
      const broken = JSON.parse(v1); broken.units[0].hp = -5;
      localStorage.setItem(GW.Save.keyFor(2), JSON.stringify(broken));
    }, v1);
    await page.reload();
    await page.waitForFunction(() => GW.SceneManager.currentName === 'mainMenu');
    await page.click('[data-home="load"]');
    assert.match(await page.textContent('[data-load-slot="2"]'), /Unreadable save/);
    // The broken slot is reported and nothing loads.
    await page.click('[data-load-slot="2"]');
    assert.match(await page.textContent('#toast'), /Save Slot 2 could not be loaded: Invalid expedition save: unit stats\..*backup/);
    assert.equal(await page.evaluate(() => GW.SceneManager.currentName), 'mainMenu');
    // The v0.5 save is backed up untouched, then upgraded and loaded.
    await page.click('[data-load-slot="3"]');
    await page.waitForFunction(() => GW.SceneManager.currentName === 'gameplay');
    assert.equal(await page.evaluate(() => localStorage.getItem(GW.Save.backupKey(3, 1))), v1);
    assert.equal(await page.evaluate(() => GW.Units.crew().length), 5, 'Vance and four drones');
    await page.evaluate(() => GW.Save.save(3));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(GW.Save.keyFor(3))).schema === GW.SAVE_SCHEMA), true, 'rewritten in the current format');
    assert.equal(await page.evaluate(() => localStorage.getItem(GW.Save.backupKey(3, 1))), v1, 'backup survives the autosave');
    await page.evaluate(() => localStorage.clear());
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('debug cheats and the Map Editor work from the interface', { skip, timeout: 60000 }, async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const errors = track(page);
    await startGame(page, pathToFileURL(path.join(ROOT, 'index.html')).href);
    assert.equal(await page.title(), 'Abyssal Dawn: Zero Earth Protocol');
    assert.ok(await page.evaluate(() => GW.State.grid.tiles.every(t => t === GW.TT.GRASS)), 'new games start on all grass');
    assert.ok(await page.isHidden('#mapEdBtn'), 'Map Editor button only in debug mode');
    await page.click('#dbgBtn');
    // Cheats.
    const metal = await page.evaluate(() => GW.Economy.get('metal'));
    await page.click('#dbgPanel [data-metal="1000"]');
    assert.equal(await page.evaluate(() => GW.Economy.get('metal')), metal + 1000);
    await page.click('#dbgPanel [data-cheat="god"]');
    await page.click('#dbgPanel [data-cheat="instantBuild"]');
    assert.deepEqual(await page.evaluate(() => [GW.Cheats.god, GW.Cheats.instantBuild]), [true, true]);
    // Map Editor: drag a water stroke east of Vance.
    await page.click('#mapEdBtn');
    assert.ok(await page.isVisible('#mapEdPanel'));
    assert.ok(await page.isVisible('#mapEdBtn'), 'button stays while the editor is open');
    await page.click('#mapEdPanel [data-terrain="water"]');
    await page.click('#mapEdPanel [data-brush="3"]');
    const tiles = await page.evaluate(() => { const h = GW.Units.hero(), T = GW.CONFIG.TILE; return { gx: Math.floor(h.x / T) + 4, gy: Math.floor(h.y / T) - 3, T }; });
    const a = await screen(page, (tiles.gx + 0.5) * tiles.T, (tiles.gy + 0.5) * tiles.T), b = await screen(page, (tiles.gx + 6.5) * tiles.T, (tiles.gy + 0.5) * tiles.T);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 6, a.y);
    await page.mouse.up();
    const row = await page.evaluate(({ gx, gy }) => Array.from({ length: 7 }, (_, i) => GW.State.grid.get(gx + i, gy)), tiles);
    assert.ok(row.every(t => t === 2), 'water along the stroke: ' + row);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'map-editor.png') });
    // Objects: place a wall; Erase: remove it.
    await page.click('#mapEdPanel [data-tab="objects"]');
    const wallIndex = await page.evaluate(() => GW.MapEditorUI.objects().findIndex(e => e.key === 'wall'));
    await page.click(`#mapEdPanel [data-obj="${wallIndex}"]`);
    const w = await screen(page, (tiles.gx + 0.5) * tiles.T, (tiles.gy + 4.5) * tiles.T);
    await page.mouse.click(w.x, w.y);
    assert.equal(await page.evaluate(({ gx, gy }) => GW.Buildings.at(gx, gy + 4)?.type, tiles), 'wall');
    await page.click('#mapEdPanel [data-tab="erase"]');
    await page.mouse.click(w.x, w.y);
    assert.equal(await page.evaluate(({ gx, gy }) => GW.Buildings.at(gx, gy + 4), tiles), null);
    // Reset asks once, then clears the map to grass.
    await page.click('#mapEdPanel [data-tab="terrain"]');
    await page.click('#medReset'); await page.click('#medReset');
    assert.ok(await page.evaluate(() => GW.State.grid.tiles.every(t => t === GW.TT.GRASS)));
    await page.click('#medClose');
    assert.ok(await page.isHidden('#mapEdBtn'), 'hidden again once debug mode is closed');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('spawner rally point moves with a tap; the inventory closes with × and drags by its title bar', { skip, timeout: 60000 }, async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const errors = track(page);
    await startGame(page, pathToFileURL(path.join(ROOT, 'index.html')).href);
    // Open the Hostile Fabricator's window.
    const hf = await page.evaluate(() => { const b = GW.State.buildings.find(b => b.type === 'hostile_fabricator'); GW.centerCamera(b.x, b.y + 150, 0.72); return { id: b.id, x: b.x, y: b.y }; });
    await page.waitForTimeout(200);
    let p = await screen(page, hf.x, hf.y);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#spawnerPanel:not(.hidden) #spRally');
    assert.match(await page.textContent('#spawnerPanel'), /Gather at rally point/);
    assert.doesNotMatch(await page.textContent('#spawnerPanel'), /Hold position/);
    // Move the rally point with a tap on the map.
    await page.click('#spRally');
    const target = await page.evaluate(({ x, y }) => GW.openPoint(x - 300, y + 300), hf);   // clear of the spawner window
    p = await screen(page, target.x, target.y);
    await page.mouse.click(p.x, p.y);
    const rally = await page.evaluate(id => ({ ...GW.State.buildings.find(b => b.id === id).spawner.rally }), hf.id);
    assert.ok(Math.hypot(rally.x - target.x, rally.y - target.y) < 30, 'rally point set where tapped');
    // Spawn a small batch: they appear at the spawn point and gather at the flag.
    await page.click('#spawnerPanel [data-rate="25"]');
    await page.fill('#spAmount', '20'); await page.press('#spAmount', 'Enter'); await page.click('#spawnerPanel h2');
    await page.click('#spStart');
    await page.waitForFunction(id => GW.State.buildings.find(b => b.id === id).spawner.spawned >= 20, hf.id, { timeout: 15000 });
    await page.waitForFunction(({ id, r }) => GW.Spawner.spawnedBy(GW.State.buildings.find(b => b.id === id)).every(u => Math.hypot(u.x - r.x, u.y - r.y) < 220), { id: hf.id, r: rally }, { timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, 'spawner-rally.png') });
    await page.click('#spClose');
    // Inventory: × closes it; the title bar drags it.
    await page.keyboard.press('i');
    await page.waitForSelector('#inventoryPanel:not(.hidden) #invClose');
    const before = await page.$eval('#inventoryPanel', el => el.getBoundingClientRect().toJSON());
    const head = await page.$eval('#inventoryPanel [data-drag-handle] h3', el => el.getBoundingClientRect().toJSON());
    await page.mouse.move(head.x + 60, head.y + head.height / 2); await page.mouse.down();
    for (let i = 1; i <= 5; i++) await page.mouse.move(head.x + 60 + i * 60, head.y + head.height / 2 + i * 30);
    await page.mouse.up();
    const after = await page.$eval('#inventoryPanel', el => el.getBoundingClientRect().toJSON());
    assert.ok(Math.abs(after.x - before.x - 300) < 3 && Math.abs(after.y - before.y - 150) < 3, `moved by (300,150): ${after.x - before.x}, ${after.y - before.y}`);
    const close = await page.$eval('#invClose', el => el.getBoundingClientRect().toJSON());
    assert.ok(close.x - after.x < 40 && close.y - after.y < 40, 'close button in the top-left corner');
    await page.screenshot({ path: path.join(OUT, 'inventory-moved.png') });
    await page.click('#invClose');
    assert.ok(await page.isHidden('#inventoryPanel'));
    await page.keyboard.press('i');
    const reopened = await page.$eval('#inventoryPanel', el => el.getBoundingClientRect().toJSON());
    assert.ok(Math.abs(reopened.x - after.x) < 3, 'reopens where it was left');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
