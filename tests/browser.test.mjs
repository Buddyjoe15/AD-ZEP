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
function track(page){
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  return errors;
}
const screen = (page, x, y) => page.evaluate(([x, y]) => GW.screenFromWorld(x, y), [x, y]);
async function startGame(page, url){
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

      // Box-select everyone with a drag.
      await page.mouse.move(20, 200); await page.mouse.down(); await page.mouse.move(1340, 880, { steps: 5 }); await page.mouse.up();
      assert.ok(await page.evaluate(() => GW.State.selected.size >= 4));

      // Expedition log renders and its actions work.
      await page.click('#ezToggle');
      await page.waitForSelector('#ezPanel:not(.hidden) .ezChecklist');
      await page.click('#ezPanel [data-ez="survey"]');
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

test('renders 2,000 units at an interactive frame rate', { skip, timeout: 60000 }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const errors = track(page);
    await startGame(page, pathToFileURL(path.join(ROOT, 'index.html')).href);
    const fps = await page.evaluate(async () => {
      const S = GW.State, sh = GW.Units.ship();
      GW.CONFIG.POPULATION_CAP = 1e9;
      for (let i = 0; i < 1000; i++){
        const a = GW.openPoint(sh.x - 1500 + (i % 50) * 60, sh.y + 500 + Math.floor(i / 50) * 60);
        const b = GW.openPoint(sh.x - 1500 + (i % 50) * 60, sh.y + 1800 + Math.floor(i / 50) * 60);
        GW.Units.spawn('security_drone', a.x, a.y); GW.Units.spawn('hostile_machine', b.x, b.y);
      }
      GW.rebuildSpatial();
      GW.centerCamera(sh.x, sh.y + 1500, 0.35);
      await new Promise(r => setTimeout(r, 1000));
      let frames = 0; const t0 = performance.now();
      await new Promise(r => { const f = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
      return { fps: frames / ((performance.now() - t0) / 1000), units: S.units.length, update: S.metrics.updateMs, draw: S.metrics.drawMs };
    });
    console.log(`    stress: ${fps.fps.toFixed(1)} fps, ${fps.units} units alive, update ${fps.update.toFixed(1)} ms, draw ${fps.draw.toFixed(1)} ms`);
    await page.screenshot({ path: path.join(OUT, 'stress.png') });
    assert.ok(fps.fps > 10, 'frame rate ' + fps.fps.toFixed(1));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
