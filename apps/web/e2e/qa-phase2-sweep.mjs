// Run from the repository root: node apps/web/e2e/qa-phase2-sweep.mjs
// Uses actual committed geometry/dossiers and the local kit index; no route mocks.
import { chromium, devices, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
const { createExpression } = createRequire(require.resolve('maplibre-gl/package.json'))('@maplibre/maplibre-gl-style-spec');
const artifacts = join(root, 'apps/web/e2e/artifacts/qa-phase2');
await mkdir(artifacts, { recursive: true });
const report = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), modes: [] };
// Compare contact names locally without printing or persisting the names.
const contactNames = new Set();
const kit = process.env.COSTAR_DATA_DIR ?? join(root, 'data/costar');
function collectContacts(value, inside = false) {
  if (!value || typeof value !== 'object') return;
  if (inside && value.firstName && value.lastName) contactNames.add(`${value.firstName} ${value.lastName}`.toLowerCase());
  for (const [key, item] of Object.entries(value)) {
    const contact = inside || /contact|owner|broker/i.test(key);
    collectContacts(item, contact);
  }
}
for (const file of ['commercial-property', 'commercial-listing-summary', 'location-occupancy']) {
  try {
    for await (const line of createInterface({ input: createReadStream(join(kit, 'data', `${file}.jsonl`)), crlfDelay: Infinity })) {
      if (line.trim()) collectContacts(JSON.parse(line));
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function noContactNames(text) {
  const lower = text.toLowerCase();
  const leaked = [...contactNames].some((name) => lower.includes(name));
  expect(leaked, 'No kit contact names may appear in API output or rendered text').toBe(false);
}
report.contactNamesChecked = contactNames.size;
const base = 'http://127.0.0.1:15175';
const api = 'http://127.0.0.1:18002';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready(url) {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(url)).ok) return; } catch { /* starting */ }
    await delay(100);
  }
  throw new Error(`Server did not start: ${url}`);
}
async function stop(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill(signal);
  await exited;
}
const web = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '15175', '--strictPort'], {
  cwd: join(root, 'apps/web'), env: { ...process.env, API_PROXY_TARGET: api }, stdio: 'ignore',
});
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await ready(base);
  for (const mode of ['kit', 'fixtures']) {
    const result = { mode, checks: [], errors: [], phases: [], api: [], screenshots: [] };
    report.modes.push(result);
    const state = await mkdtemp(join(tmpdir(), 'lo-qa-phase2-'));
    let backend;
    const start = async () => {
      backend = spawn(join(root, 'server/.venv/bin/python'), ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '18002'], {
        cwd: join(root, 'server'), stdio: 'ignore', env: { ...process.env, STATE_DIR: state, HOST_PIN: '1234', DATA_MODE: mode, PHASE_DURATIONS_SCALE: '0.1', PUBLIC_BASE_URL: '' },
      });
      await ready(`${api}/api/health`);
    };
    const contexts = await Promise.all([
      browser.newContext({ viewport: { width: 1920, height: 1080 } }),
      browser.newContext({ ...devices['iPhone 13'] }),
      browser.newContext({ ...devices['Pixel 7'] }),
      browser.newContext({ ...devices['iPhone 13'] }),
    ]);
    const pages = [];
    let restarting = false;
    const page = async (context, label) => {
      const p = await context.newPage();
      pages.push({ p, label });
      p.on('console', (m) => { if (m.type() === 'error') result.errors.push({ page: label, kind: 'console', text: m.text(), restarting }); });
      p.on('pageerror', (e) => result.errors.push({ page: label, kind: 'exception', text: e.message, restarting }));
      p.on('requestfailed', (r) => result.errors.push({ page: label, kind: 'network', url: r.url(), text: r.failure()?.errorText, restarting }));
      p.on('response', (r) => { if (r.status() >= 400) result.errors.push({ page: label, kind: 'http', url: r.url(), status: r.status(), restarting }); });
      return p;
    };
    const screenshot = async (label) => {
      await Promise.all(pages.map(async ({ p, label: name }) => {
        const path = join(artifacts, `${mode}-${label}-${name}.png`);
        await p.screenshot({ path }); result.screenshots.push(path);
      }));
    };
    const check = async (name, fn) => {
      try { const detail = await fn(); result.checks.push({ name, pass: true, detail }); }
      catch (error) { result.checks.push({ name, pass: false, error: error.message }); await screenshot(`failure-${name.replace(/\W/g, '-')}`).catch(() => {}); }
    };
    const phase = (p) => p.getByTestId('phase').locator('strong');
    try {
      await start();
      const screen = await page(contexts[0], 'screen');
      const admin = await page(contexts[0], 'admin');
      await screen.goto(`${base}/screen`);
      await expect(screen.getByTestId('qr').locator('svg')).toBeVisible();
      const joinURL = (await screen.locator('aside p').filter({ hasText: '/play?room=' }).innerText()).trim();
      const room = new URL(joinURL).searchParams.get('room');
      await admin.goto(`${base}/admin`);
      await admin.getByLabel('Host PIN').fill('1234');
      await expect(admin.getByText(/· open ·/)).toBeVisible();
      const phones = [];
      for (let i = 0; i < 3; i++) {
        const p = await page(contexts[i + 1], `phone-${i + 1}`);
        phones.push(p); await p.goto(joinURL);
        await p.getByLabel('Nickname').fill(['Ann', 'Bo', 'Cy'][i]);
        await p.getByRole('button', { name: 'Join', exact: true }).tap();
      }
      await check('three phones join QR URL', async () => {
        await expect(screen.locator('aside li')).toHaveCount(3);
        for (const p of phones) await expect(phase(p)).toHaveText('EXPLORE');
      });
      await check('real building APIs', async () => {
        const response = await fetch(`${api}/api/buildings`);
        expect(response.status).toBe(200);
        const buildings = await response.json();
        for (const b of buildings) {
          const d = await (await fetch(`${api}/api/buildings/${b.id}`)).json();
          const committed = JSON.parse(await readFile(join(root, `server/fixtures/dossiers/${b.id}.json`), 'utf8'));
          expect(d).toEqual({ ...committed, data_mode: mode });
          expect(JSON.stringify(d)).not.toMatch(/\bvacant\b|"(?:contacts?|brokers?|owners?)"/i);
          noContactNames(JSON.stringify(d));
          result.api.push({ id: b.id, data_mode: d.data_mode, darkFloors: d.floors.filter((f) => f.source_status === 'dark').map((f) => f.number) });
        }
        return `${buildings.length} real dossiers verified`;
      });
      await check('room mode matches process mode', async () => {
        await expect(admin.getByText(new RegExp(`data mode: ${mode}`))).toBeVisible();
      });
      await check('actual skyline, beam hover and grounded card', async () => {
        await expect.poll(() => screen.evaluate(() => Boolean(window.__lightsOnMap?.getLayer('floors')))).toBe(true);
        const hit = await screen.evaluate(() => {
          const map = window.__lightsOnMap;
          const { width, height } = map.getCanvas().getBoundingClientRect();
          for (let y = 20; y < height; y += 3) for (let x = 0; x < width; x += 3) {
            if (map.queryRenderedFeatures([x, y], { layers: ['floors'] })[0]?.properties?.building_id === '233953') return { x: x / width, y: y / height };
          }
          throw new Error('Esperson is not rendered');
        });
        const box = await phones[0].getByTestId('trackpad').boundingBox();
        await phones[0].touchscreen.tap(box.x + box.width * hit.x, box.y + box.height * hit.y);
        await expect(screen.getByTestId('hover-card')).toContainText('Esperson');
        const d = await (await fetch(`${api}/api/buildings/233953`)).json();
        const text = await screen.getByTestId('hover-card').innerText();
        expect(text).toContain(`${d.stories} stories`);
        expect(text).toContain(`${d.floors.filter((f) => f.source_status === 'dark').length} dark floors`);
        expect(text).toContain(d.facts.find((f) => f.key === 'available_sqft').say_as);
        await screenshot('hover'); return text;
      });
      await check('all phones drag trackpads without sensors', async () => {
        for (const [i, p] of phones.entries()) {
          const pad = await p.getByTestId('trackpad').boundingBox();
          const touch = await contexts[i + 1].newCDPSession(p);
          for (const [type, fraction] of [['touchStart', 0.2], ['touchMove', 0.4], ['touchMove', 0.7]]) {
            await delay(60);
            await touch.send('Input.dispatchTouchEvent', { type, touchPoints: [{ x: pad.x + pad.width * fraction, y: pad.y + pad.height * fraction }] });
          }
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          const dot = screen.getByTestId('dot').filter({ hasText: ['Ann', 'Bo', 'Cy'][i] });
          await expect.poll(() => dot.evaluate((node) => parseFloat(node.style.left))).toBeCloseTo(70, 0);
        }
      });
      await check('source floor status colors match PRD', async () => {
        const paint = await screen.evaluate(() => window.__lightsOnMap.getPaintProperty('floors', 'fill-extrusion-color'));
        const expression = createExpression(paint, 'layers[0].paint.fill-extrusion-color');
        expect(expression.result).toBe('success');
        const floors = await (await fetch(`${base}/floors.geojson`)).json();
        const colors = { dark: '#1a1d2b', partial: '#4a4636', occupied: '#f2c46d', unknown: '#3a3f52' };
        const actual = {};
        for (const [status, color] of Object.entries(colors)) {
          const feature = floors.features.find((f) => f.properties.source_status === status);
          expect(feature, `${status} exists in real geometry`).toBeTruthy();
          actual[status] = expression.value.evaluate({ zoom: 15.5 }, { type: 'Polygon', properties: feature.properties });
        }
        await screenshot('floor-colors');
        expect(actual).toEqual(colors);
      });
      await check('host skip and mid-phase reset', async () => {
        await admin.getByRole('button', { name: 'Skip phase', exact: true }).click();
        await expect(phase(screen)).toHaveText('INTRO');
        await admin.getByRole('button', { name: 'Reset round', exact: true }).click();
        await expect(phase(screen)).toHaveText('EXPLORE');
      });
      await check('every scaled timer phase and phone reload', async () => {
        const screenshots = [];
        // Capture the existing websocket via a DOM observer; saves after React renders.
        await screen.exposeFunction('qaPhase', (value) => { result.phases.push(value); screenshots.push(screenshot(value)); });
        await screen.evaluate(() => {
          const element = document.querySelector('[data-testid="phase"] strong');
          window.qaObserver = new MutationObserver(() => window.qaPhase(element.textContent));
          window.qaObserver.observe(element, { childList: true, subtree: true, characterData: true });
        });
        await phones[0].getByRole('button', { name: 'Wake building Esperson', exact: true }).tap();
        await expect(phase(screen)).toHaveText('PITCH');
        await expect.poll(() => screen.evaluate(() => window.__lightsOnMap.getZoom())).toBeGreaterThan(17.4);
        const id = await phones[0].evaluate((r) => localStorage.getItem(`lo.player.${r}`), room);
        await phones[0].reload();
        await expect(phones[0].getByRole('heading', { name: 'Ann', exact: true })).toBeVisible();
        expect(await phones[0].evaluate((r) => localStorage.getItem(`lo.player.${r}`), room)).toBe(id);
        await expect(phase(screen)).toHaveText('EXPLORE', { timeout: 20000 });
        await screen.evaluate(() => window.qaObserver.disconnect());
        await Promise.all(screenshots);
        expect(result.phases).toEqual(['INTRO', 'PITCH', 'CHALLENGE', 'NEGOTIATE', 'VERDICT', 'POWER_UP', 'REVIVED', 'EXPLORE']);
      });
      await check('kill and restart backend mid-round', async () => {
        await phones[0].getByRole('button', { name: /^Wake building / }).first().tap();
        await expect(phase(screen)).toHaveText('PITCH');
        restarting = true;
        await stop(backend, 'SIGKILL'); await start();
        for (const p of [screen, ...phones]) await expect(p.getByRole('status')).toHaveCount(0, { timeout: 10000 });
        await expect(phase(screen)).toHaveText('PITCH');
        await expect(screen.locator('aside li')).toHaveCount(3);
        for (const [i, p] of phones.entries()) await expect(p.getByRole('heading', { name: ['Ann', 'Bo', 'Cy'][i], exact: true })).toBeVisible();
        await expect(screen.getByText('Waking Esperson')).toBeVisible();
        restarting = false; await screenshot('restarted');
        await admin.getByRole('button', { name: 'Reset round', exact: true }).click();
        await expect(phase(screen)).toHaveText('EXPLORE');
      });
      await check('host data mode changes API provider', async () => {
        const other = mode === 'kit' ? 'fixtures' : 'kit';
        await admin.getByRole('button', { name: `Data: ${other}`, exact: true }).click();
        await expect(admin.getByText(new RegExp(`data mode: ${other}`))).toBeVisible();
        const d = await (await fetch(`${api}/api/buildings/233953?room=${room}`)).json();
        expect(d.data_mode).toBe(other);
      });
      await check('reset room clears players and permits rejoin', async () => {
        await admin.getByRole('button', { name: 'Reset room', exact: true }).click();
        await expect(phase(screen)).toHaveText('LOBBY');
        await expect(screen.locator('aside li')).toHaveCount(0);
        for (const [i, p] of phones.entries()) {
          await expect(p.getByLabel('Nickname')).toBeVisible();
          await p.getByLabel('Nickname').fill(['Ann', 'Bo', 'Cy'][i]);
          await p.getByRole('button', { name: 'Join', exact: true }).tap();
        }
        await expect(screen.locator('aside li')).toHaveCount(3);
        await screenshot('reset-rejoin');
      });
      await check('rendered prohibited word and contact field check', async () => {
        for (const { p } of pages) {
          const text = await p.locator('body').innerText();
          expect(text).not.toMatch(/\bvacant\b|broker|owner|contact-/i);
          noContactNames(text);
        }
      });
      await check('no browser errors outside deliberate restart', () => {
        expect(result.errors.filter((e) => !e.restarting)).toEqual([]);
      });
    } catch (e) {
      result.checks.push({ name: 'sweep setup', pass: false, error: e.stack });
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await stop(backend);
      await writeFile(join(artifacts, 'results.json'), JSON.stringify(report, null, 2));
      console.log(`${mode}: ${result.checks.filter((c) => c.pass).length}/${result.checks.length} checks passed`);
    }
  }
} finally { await browser.close(); await stop(web); }
console.log(`Report: ${join(artifacts, 'results.json')}`);
if (report.modes.some((m) => m.checks.some((c) => !c.pass))) process.exitCode = 1;
