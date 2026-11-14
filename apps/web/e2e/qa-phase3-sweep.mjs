// Real-server Phase 3 QA: node apps/web/e2e/qa-phase3-sweep.mjs
// No API, WebSocket, geometry, dossier, or agent mocks. Artifacts are ignored.
import { chromium, devices, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const artifacts = join(root, 'apps/web/e2e/artifacts/qa-phase3');
await mkdir(artifacts, { recursive: true });
const base = 'http://127.0.0.1:15176', api = 'http://127.0.0.1:18003';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const require = createRequire(import.meta.url);
const { createExpression } = createRequire(require.resolve('maplibre-gl/package.json'))('@maplibre/maplibre-gl-style-spec');
const report = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), modes: [] };
const contacts = new Set();
function collect(value, inside = false) {
  if (!value || typeof value !== 'object') return;
  if (inside && value.firstName && value.lastName) contacts.add(`${value.firstName} ${value.lastName}`.toLowerCase());
  for (const [key, item] of Object.entries(value)) collect(item, inside || /contact|owner|broker/i.test(key));
}
for (const name of ['commercial-property', 'commercial-listing-summary', 'location-occupancy']) {
  const file = join(process.env.COSTAR_DATA_DIR ?? join(root, 'data/costar'), 'data', `${name}.jsonl`);
  try { for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) if (line.trim()) collect(JSON.parse(line)); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
report.contactNamesChecked = contacts.size;
function privacy(text) {
  expect(text).not.toMatch(/\bvacant\b|"(?:broker|owner|contacts?)"\s*:/i);
  expect([...contacts].some((name) => text.toLowerCase().includes(name)), 'Kit contact name leakage').toBe(false);
}
async function ready(url) {
  for (let n = 0; n < 150; n++) { try { if ((await fetch(url)).ok) return; } catch {} await delay(100); }
  throw new Error(`Not ready: ${url}`);
}
async function stop(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, 'exit'); child.kill(signal); await exit;
}
const web = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '15176', '--strictPort'], { cwd: join(root, 'apps/web'), env: { ...process.env, API_PROXY_TARGET: api }, stdio: 'ignore' });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await ready(base);
  for (const mode of ['kit', 'fixtures']) {
    const result = { mode, checks: [], rounds: [], errors: [], screenshots: [], events: [] };
    report.modes.push(result);
    const stateDir = await mkdtemp(join(tmpdir(), 'lo-phase3-'));
    let backend, restarting = false;
    const start = async () => {
      backend = spawn(join(root, 'server/.venv/bin/python'), ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '18003'], { cwd: join(root, 'server'), env: { ...process.env, DATA_MODE: mode, STATE_DIR: stateDir, HOST_PIN: '1234', PUBLIC_BASE_URL: '', PHASE_DURATIONS_SCALE: '0.1' }, stdio: ['ignore', 'ignore', 'pipe'] });
      backend.stderr.on('data', (data) => { const text = String(data); if (/ERROR|Traceback/.test(text)) result.errors.push({ kind: 'server', text, restarting }); });
      await ready(`${api}/api/health`);
    };
    const contexts = await Promise.all([browser.newContext({ viewport: { width: 1920, height: 1080 } }), ...['iPhone 13', 'Pixel 7', 'iPhone 13'].map((d) => browser.newContext({ ...devices[d] }))]);
    const pages = [];
    const shortShots = [];
    const page = async (context, label) => {
      const p = await context.newPage(); p.setDefaultTimeout(5000); pages.push({ p, label });
      p.on('console', (m) => { if (m.type() === 'error') result.errors.push({ page: label, kind: 'console', text: m.text(), restarting }); });
      p.on('pageerror', (e) => result.errors.push({ page: label, kind: 'exception', text: e.message, restarting }));
      p.on('requestfailed', (r) => result.errors.push({ page: label, kind: 'network', url: r.url(), text: r.failure()?.errorText, restarting }));
      p.on('response', (r) => { if (r.status() >= 400) result.errors.push({ page: label, kind: 'http', url: r.url(), status: r.status(), restarting }); });
      p.on('websocket', (ws) => ws.on('framereceived', ({ payload }) => { try { const msg = JSON.parse(String(payload)); result.events.push({ page: label, at: Date.now(), ...msg });
        if (label === 'screen' && msg.type === 'phase_changed' && ['INTRO', 'POWER_UP'].includes(msg.phase) && !result.screenshots.includes(`${mode}-${msg.phase}-screen.png`)) {
          const file = `${mode}-${msg.phase}-screen.png`; result.screenshots.push(file);
          shortShots.push(p.screenshot({ path: join(artifacts, file) }).catch((e) => result.errors.push({ kind: 'screenshot', text: e.message, restarting })));
        } } catch {} }));
      await p.addInitScript(() => {
        window.__qa = { events: [], sockets: [], paints: [] };
        const Native = window.WebSocket;
        window.WebSocket = class extends Native {
          constructor(...args) { super(...args); window.__qa.sockets.push(this); this.addEventListener('message', (e) => window.__qa.events.push({ at: performance.now(), ...JSON.parse(e.data) })); }
        };
      });
      return p;
    };
    const screenshot = async (label) => {
      await Promise.all(pages.map(async ({ p, label: name }) => { const file = `${mode}-${label}-${name}.png`; await p.screenshot({ path: join(artifacts, file) }); result.screenshots.push(file); }));
    };
    const check = async (name, fn) => {
      try { const detail = await fn(); result.checks.push({ name, pass: true, detail }); console.log(`${mode} PASS ${name}`); }
      catch (e) { result.checks.push({ name, pass: false, error: e.stack }); console.log(`${mode} FAIL ${name}: ${e.message}`); await screenshot(`failure-${name.replace(/\W/g, '-')}`).catch(() => {}); }
      await writeFile(join(artifacts, 'results.json'), JSON.stringify(report, null, 2));
    };
    const phase = (p) => p.getByTestId('phase').locator('strong');
    const state = async () => JSON.parse(await readFile(join(stateDir, `${room}.json`), 'utf8'));
    const host = async (action) => admin.getByRole('button', { name: action, exact: true }).click();
    const events = (type) => result.events.filter((e) => e.page === 'screen' && e.type === type);
    let screen, admin, phones, room;
    const mapReady = async () => {
      await expect.poll(() => screen.evaluate(() => !!window.__lightsOnMap?.getLayer('floors'))).toBe(true);
      await screen.evaluate(() => { const map = window.__lightsOnMap; const original = map.setPaintProperty.bind(map); map.setPaintProperty = (...args) => { if (args[1] === 'fill-extrusion-color') window.__qa.paints.push({ at: performance.now(), expression: args[2] }); return original(...args); }; });
    };
    const tapCharge = async (p) => { const box = await p.getByRole('button', { name: 'Tap to charge' }).boundingBox(); await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); };
    const fresh = async () => { await host('Reset round'); await expect(phase(screen)).toHaveText('EXPLORE'); };
    const wake = async (bid) => { const d = await (await fetch(`${api}/api/buildings/${bid}`)).json(); await phones[0].getByRole('button', { name: `Wake building ${d.name}`, exact: true }).tap(); await expect(phase(screen)).toHaveText('INTRO'); return d; };
    const pitch = async (winner = 0, category = 'housing') => {
      await expect(phase(screen)).toHaveText('PITCH');
      for (let i = 0; i < 2; i++) { await phones[i].getByLabel('Your pitch').fill(i === winner ? `Shared public ${category} homes apartments for everyone with a welcoming lobby and places for neighbors to meet` : 'A small office'); await phones[i].getByRole('button', { name: 'Submit pitch' }).tap(); }
    };
    const revision = async (winner = 0, category = 'housing') => {
      await expect(phase(screen)).toHaveText('NEGOTIATE', { timeout: 10000 });
      for (let i = 0; i < 2; i++) { await phones[i].getByLabel('Your revision').fill(i === winner ? `Public shared ${category} homes apartments for everyone with affordable spaces and a welcoming ground floor lobby open daily for neighbors` : 'A simple office space'); await phones[i].getByRole('button', { name: 'Send revision' }).tap(); }
    };
    const colors = async (snapshot) => {
      await mapReady();
      await expect.poll(() => screen.evaluate(() => JSON.stringify(window.__lightsOnMap.getPaintProperty('floors', 'fill-extrusion-color')))).not.toContain('interpolate');
      const paint = await screen.evaluate(() => window.__lightsOnMap.getPaintProperty('floors', 'fill-extrusion-color'));
      const compiled = createExpression(paint, 'layers[0].paint.fill-extrusion-color'); expect(compiled.result).toBe('success');
      const geometry = await (await fetch(`${base}/floors.geojson`)).json();
      for (const [bid, floors] of Object.entries(snapshot.floor_states)) for (const [floor, value] of Object.entries(floors)) {
        const feature = geometry.features.find((f) => f.properties.building_id === bid && f.properties.floor_number === Number(floor));
        expect(feature, `Geometry ${bid}/${floor}`).toBeTruthy();
        expect(compiled.value.evaluate({ zoom: 18 }, { type: 'Polygon', properties: feature.properties })).toBe(value.color);
      }
    };
    try {
      await start(); screen = await page(contexts[0], 'screen'); admin = await page(contexts[0], 'admin');
      phones = await Promise.all(contexts.slice(1).map((c, i) => page(c, `phone${i + 1}`)));
      await screen.goto(`${base}/screen`); await expect(screen.getByTestId('qr').locator('svg')).toBeVisible(); await mapReady();
      const joinURL = (await screen.locator('aside p').filter({ hasText: '/play?room=' }).innerText()).trim(); room = new URL(joinURL).searchParams.get('room');
      await admin.goto(`${base}/admin`); await admin.getByLabel('Host PIN').fill('1234');
      await check('three phones join QR URL and mode is correct', async () => {
        for (const [i, name] of ['Ann', 'Bo', 'Cy'].entries()) { await phones[i].goto(joinURL); await phones[i].getByLabel('Nickname').fill(name); await phones[i].getByRole('button', { name: 'Join', exact: true }).tap(); await expect(phones[i].getByRole('heading', { name, exact: true })).toBeVisible(); }
        await expect(screen.locator('aside li')).toHaveCount(3); expect((await state()).data_mode).toBe(mode);
      });
      await check('trackpad hover grounded in dossier', async () => {
        const point = await screen.evaluate(() => {
          const map = window.__lightsOnMap, { width, height } = map.getCanvas().getBoundingClientRect();
          for (let y = 20; y < height; y += 3) for (let x = 0; x < width; x += 3) {
            if (map.queryRenderedFeatures([x, y], { layers: ['floors'] })[0]?.properties?.building_id === '233953') return { x: x / width, y: y / height };
          }
          throw Error('Esperson is not rendered');
        });
        const box = await phones[0].getByTestId('trackpad').boundingBox(); await phones[0].touchscreen.tap(box.x + point.x * box.width, box.y + point.y * box.height);
        await expect(screen.getByTestId('hover-card')).toContainText('Esperson');
      });
      for (let n = 0; n < 5; n++) await check(`complete unmocked typed round ${n + 1}`, async () => {
        await expect(phase(screen)).toHaveText('EXPLORE');
        const bid = n < 4 ? '233953' : '233899', winner = n % 2;
        const before = await state(), dossier = await wake(bid), rid = (await state()).round_id;
        await expect(screen.getByTestId('subtitles')).toContainText('Bring me an idea');
        await pitch(winner);
        if (n === 0) await screenshot('PITCH');
        await expect(phase(screen)).toHaveText('CHALLENGE');
        const challenges = (await state()).challenges; expect(challenges).toHaveLength(2);
        for (const c of challenges) { expect(c.counteroffer).toBeTruthy(); for (const id of c.fact_ids) { const fact = dossier.facts.find((f) => f.id === id); expect(fact?.value).not.toBeNull(); expect(c.line).toContain(fact.say_as); await expect(screen.getByRole('region', { name: 'Building counteroffers' })).toContainText(fact.say_as); } }
        if (n === 0) await screenshot('CHALLENGE');
        await revision(winner);
        await expect(phase(screen)).toHaveText('VERDICT'); const verdict = (await state()).verdict;
        for (const s of verdict.scores) expect(s.total).toBe(s.data_fit + s.neighborhood_fit + s.creativity + s.charm);
        expect(verdict.winner_player_id).toBe((await state()).players[winner].id);
        for (const id of verdict.fact_ids) { const fact = dossier.facts.find((f) => f.id === id); expect(fact?.value).not.toBeNull(); await expect(screen.getByTestId('score-card')).toContainText(fact.say_as); }
        await expect(screen.getByTestId('score-card')).toContainText('rough game estimate');
        if (n === 0) await screenshot('VERDICT');
        await expect.poll(() => events('phase_changed').at(-1)?.phase, { intervals: [10] }).toBe('POWER_UP');
        const tapPoints = await Promise.all(phones.slice(0, 2).map((p) => p.getByRole('button', { name: 'Tap to charge' }).boundingBox()));
        const tapPair = () => Promise.all(phones.slice(0, 2).map((p, i) => p.touchscreen.tap(tapPoints[i].x + tapPoints[i].width / 2, tapPoints[i].y + tapPoints[i].height / 2)));
        await tapPair();
        await expect(screen.getByTestId('energy-meter')).toContainText('50%');
        await delay(610);
        await tapPair();
        await expect(phase(screen)).toHaveText('REVIVED'); const after = await state();
        expect(after.auto_completed).toBe(false); expect(after.charge).toBe(100);
        expect(after.city.song_layers).toBe(new Set(after.city.song_categories).size); expect(after.city.song_layers).toBeGreaterThanOrEqual(before.city.song_layers); expect(after.city.song_layers).toBeLessThanOrEqual(before.city.song_layers + 1); expect(after.city.sqft_reimagined).toBeGreaterThan(before.city.sqft_reimagined);
        const sqft = dossier.floors.filter((f) => after.target_floors.includes(f.number)).reduce((sum, f) => sum + f.available_sqft, 0);
        expect(after.city.sqft_reimagined).toBe(before.city.sqft_reimagined + sqft);
        expect(after.city.needs.housing).toBe(Math.min(100, before.city.needs.housing + Math.min(30, sqft / 1000)));
        await expect(screen.getByTestId('city-meter')).toContainText('game simulation');
        await expect(screen.getByTestId('city-meter')).toContainText(`${after.city.sqft_reimagined.toLocaleString()} sq ft reimagined`);
        await expect(screen.getByRole('meter', { name: 'Housing', exact: true })).toHaveAttribute('value', String(Math.round(after.city.needs.housing)));
        // Use the last revival: all five share one screen and performance clock.
        const latency = await screen.evaluate(() => { const e = window.__qa.events.filter((e) => e.type === 'building_revived').at(-1); return window.__qa.paints.find((p) => p.at >= e.at && JSON.stringify(p.expression).includes(e.color))?.at - e.at; });
        expect(latency).toBeGreaterThanOrEqual(0); expect(latency).toBeLessThan(300);
        result.rounds.push({ round_id: rid, building_id: bid, floors: after.target_floors, winner: verdict.winner_player_id, color: after.players[winner].color, latencyMs: latency, city: after.city, scores: verdict.scores });
        if (n === 0) await screenshot('REVIVED');
        await expect(phase(screen)).toHaveText('EXPLORE'); await colors(after);
        expect(events('building_revived')).toHaveLength(n + 1);
      });
      await check('five rounds without restart and per-floor winner colors survive reload', async () => {
        expect(result.rounds).toHaveLength(5); const before = await state();
        await Promise.all([screen.reload(), phones[0].reload()]); await colors(before);
        expect((await state()).floor_states).toEqual(before.floor_states); await expect(phones[0].getByRole('heading', { name: 'Ann', exact: true })).toBeVisible();
        await screenshot('reloaded-five-rounds');
      });
      await check('no_dark_floors rejection after Esperson exhausted', async () => {
        await fresh(); const errorsBefore = result.events.length;
        await phones[0].evaluate(() => window.__qa.sockets.at(-1).send(JSON.stringify({ type: 'wake', building_id: '233953', nonce: 'exhausted' })));
        await expect.poll(() => result.events.slice(errorsBefore).some((e) => e.type === 'error' && e.code === 'no_dark_floors')).toBe(true);
        expect((await state()).phase).toBe('EXPLORE');
      });
      await check('no_pitches timer returns to EXPLORE', async () => {
        await fresh(); const count = events('error').length; await wake('233899');
        await expect(phase(screen)).toHaveText('PITCH'); await expect(phase(screen)).toHaveText('EXPLORE', { timeout: 10000 });
        expect(events('error').slice(count).some((e) => e.code === 'no_pitches')).toBe(true);
      });
      await check('phone and screen reload during negotiation restores submissions and evidence', async () => {
        await fresh(); await wake('233899'); await pitch(); await revision(); const before = await state();
        await Promise.all([screen.reload(), phones[0].reload()]);
        await expect(phones[0].getByRole('button', { name: 'Sent', exact: true })).toBeDisabled();
        await expect(screen.getByRole('region', { name: 'Building counteroffers' })).toContainText(before.challenges[0].line);
        expect((await state()).round_id).toBe(before.round_id); await screenshot('mid-round-reload'); await fresh();
      });
      await check('SIGKILL and restart mid-round restores pitches, revivals and players', async () => {
        await fresh(); await wake('233899'); await pitch(); const before = await state();
        restarting = true; await stop(backend, 'SIGKILL'); await start();
        await expect.poll(async () => screen.evaluate(() => window.__qa.events.filter((e) => e.type === 'room_state').at(-1)?.round_id), { timeout: 10000 }).toBe(before.round_id);
        const after = await state(); expect(after.pitches).toEqual(before.pitches); expect(after.floor_states).toEqual(before.floor_states); expect(after.city).toEqual(before.city);
        for (const [i, name] of ['Ann', 'Bo', 'Cy'].entries()) await expect(phones[i].getByRole('heading', { name, exact: true })).toBeVisible();
        await colors(before); await screenshot('restarted'); restarting = false; await fresh();
      });
      await check('duplicate and rapid charge events capped and revival applied once', async () => {
        await fresh(); await wake('233899'); await pitch(); await revision(); await expect.poll(() => events('phase_changed').at(-1)?.phase, { intervals: [10] }).toBe('POWER_UP');
        const before = await state(), revivals = events('building_revived').length;
        await tapCharge(phones[0]);
        const roundId = before.round_id;
        await phones[0].evaluate((roundId) => { const s = window.__qa.sockets.at(-1); const cmd = { type: 'contribute_energy', round_id: roundId, nonce: 'duplicate-qa' }; for (let i = 0; i < 20; i++) s.send(JSON.stringify(cmd)); }, roundId);
        await expect.poll(async () => (await state()).charge, { intervals: [10] }).toBe(25);
        await phones[1].evaluate((roundId) => { const s = window.__qa.sockets.at(-1); const cmd = { type: 'contribute_energy', round_id: roundId, nonce: 'accepted-duplicate-qa' }; for (let i = 0; i < 20; i++) s.send(JSON.stringify(cmd)); }, roundId);
        await expect.poll(async () => (await state()).charge).toBe(50);
        await delay(610);
        await Promise.all(phones.slice(0, 2).map(tapCharge));
        await expect(phase(screen)).toHaveText('REVIVED');
        await phones[0].evaluate((roundId) => { for (let i = 0; i < 20; i++) window.__qa.sockets.at(-1).send(JSON.stringify({ type: 'contribute_energy', round_id: roundId, nonce: `late-${i}` })); }, roundId);
        const after = await state(); expect(after.charge).toBe(100); expect(after.committed_rounds.filter((r) => r === roundId)).toHaveLength(1); expect(after.city.song_layers).toBe(new Set(after.city.song_categories).size); expect(after.city.song_layers).toBeGreaterThanOrEqual(before.city.song_layers); expect(after.city.song_layers).toBeLessThanOrEqual(before.city.song_layers + 1); expect(events('building_revived')).toHaveLength(revivals + 1);
        await screenshot('rapid-taps'); await fresh();
      });
      await check('POWER_UP timer auto-completes with zero taps', async () => {
        await fresh(); await wake('233899'); await pitch(); await revision(); await expect.poll(() => events('phase_changed').at(-1)?.phase, { intervals: [10] }).toBe('POWER_UP'); expect((await state()).charge).toBe(0);
        await expect(phase(screen)).toHaveText('REVIVED'); const after = await state(); expect(after.auto_completed).toBe(true); expect(after.charge).toBe(100); await expect(screen.getByTestId('energy-meter')).toContainText('city helped'); await screenshot('auto-complete'); await fresh();
      });
      await check('host skip reset round reset room and data provider switch', async () => {
        await wake('233899'); await host('Skip phase'); await expect(phase(screen)).toHaveText('PITCH'); await fresh();
        const other = mode === 'kit' ? 'fixtures' : 'kit'; await host(`Data: ${other}`); await expect.poll(async () => (await state()).data_mode).toBe(other); expect((await (await fetch(`${api}/api/buildings/233953`)).json()).data_mode).toBe(other); await host(`Data: ${mode}`);
        await host('Reset room'); await expect(phase(screen)).toHaveText('LOBBY'); expect((await state()).city.song_layers).toBe(0); await expect(screen.locator('aside li')).toHaveCount(0);
      });
      await check('grounded API responses and rendered text contain no kit contacts', async () => {
        const buildings = await (await fetch(`${api}/api/buildings`)).json(); privacy(JSON.stringify(buildings));
        for (const b of buildings) privacy(JSON.stringify(await (await fetch(`${api}/api/buildings/${b.id}`)).json()));
        for (const { p } of pages) privacy(await p.locator('body').innerText()); privacy(JSON.stringify(result.events));
      });
      await check('no console exception or network errors outside deliberate restart', () => { expect(result.errors.filter((e) => !e.restarting && !(e.kind === 'network' && e.text === 'net::ERR_ABORTED'))).toEqual([]); });
    } catch (e) { result.checks.push({ name: 'setup', pass: false, error: e.stack }); }
    finally { await Promise.all(shortShots); await Promise.all(contexts.map((c) => c.close())); await stop(backend); await writeFile(join(artifacts, 'results.json'), JSON.stringify(report, null, 2)); }
    console.log(`${mode}: ${result.checks.filter((c) => c.pass).length}/${result.checks.length} passed`);
  }
} finally { await browser.close(); await stop(web); }
if (report.modes.some((m) => m.checks.some((c) => !c.pass))) process.exitCode = 1;
