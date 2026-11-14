// Real-server Phase 6 QA: node apps/web/e2e/qa-phase6-sweep.mjs
// Real HTTP, sockets, geometry, dossiers and deterministic game agent.
// Prep uses an isolated, explicitly seeded cache and a guard that forbids model construction.
// No live prep or Bedrock requests; artifacts are ignored.
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
const artifacts = join(root, 'apps/web/e2e/artifacts', process.env.LO_QA_ONLY_CHECK ? 'qa-phase6-followup' : 'qa-phase6');
await mkdir(artifacts, { recursive: true });
const webPort = process.env.LO_E2E_WEB_PORT ?? '17274';
const apiPort = process.env.LO_E2E_API_PORT ?? '20201';
const base = `http://127.0.0.1:${webPort}`, api = `http://127.0.0.1:${apiPort}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const require = createRequire(import.meta.url);
const { createExpression } = createRequire(require.resolve('maplibre-gl/package.json'))('@maplibre/maplibre-gl-style-spec');
const ledger = join('/Users/momossss/Documents/GitHub/LightsOn/server/state/bedrock_spend.json');
const spendTotal = async () => JSON.parse(await readFile(ledger, 'utf8')).total_usd;
const initialSpend = await spendTotal();
const report = { spendBefore: initialSpend, revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), modes: [] };
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
const web = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', webPort, '--strictPort'], { cwd: join(root, 'apps/web'), env: { ...process.env, API_PROXY_TARGET: api }, stdio: 'ignore' });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await ready(base);
  for (const mode of ['kit', 'fixtures']) {
    const result = { mode, checks: [], rounds: [], errors: [], screenshots: [], events: [] };
    report.modes.push(result);
    const stateDir = await mkdtemp(join(tmpdir(), 'lo-phase6-'));
    const cacheDir = join(stateDir, 'prep');
    await mkdir(join(cacheDir, '233953'), { recursive: true });
    const cached = JSON.parse(await readFile(join(root, 'server/fixtures/dossiers/233953.json'), 'utf8'));
    cached.persona = JSON.parse(await readFile(join(root, 'server/fixtures/personas/233953.json'), 'utf8'));
    cached.prep_status = 'ready'; cached.intro_audio_url = null;
    await writeFile(join(cacheDir, '233953/dossier.json'), JSON.stringify(cached));
    // Isolate prep writes; fail immediately if cache handling tries any model construction.
    const bootstrap = `from pathlib import Path
import os
import app.agent.prep_agent as prep
prep.CACHE = Path(os.environ['QA_PREP_CACHE'])
prep.PERSONAS = Path(os.environ['QA_PERSONAS'])
def forbidden_model(*args, **kwargs):
    Path(os.environ['QA_MODEL_SENTINEL']).write_text('attempted')
    raise AssertionError('QA forbids Bedrock model construction')
prep.build_agent = forbidden_model
import app.rooms as rooms
# Keep the production media and payoff windows while accelerating deliberation.
rooms.DEFAULT_DURATIONS['INTRO'] = 80
rooms.DEFAULT_DURATIONS['REVIVED'] = 40
import uvicorn
uvicorn.run('app.main:app', host='127.0.0.1', port=int(os.environ['QA_API_PORT']))
`;

    let backend, restarting = false;
    const start = async () => {
      backend = spawn(join(root, 'server/.venv/bin/python'), ['-c', bootstrap], { cwd: join(root, 'server'), env: { ...process.env, AGENT_MODE: 'fake', ELEVENLABS_API_KEY: '', DATA_MODE: mode, BEDROCK_SPEND_CAP_USD: '0', LANGSMITH_API_KEY: '', LANGSMITH_TRACING: 'false', AWS_EC2_METADATA_DISABLED: 'true', QA_PREP_CACHE: cacheDir, QA_PERSONAS: join(stateDir, 'personas'), QA_MODEL_SENTINEL: join(stateDir, 'model-attempted'), QA_API_PORT: apiPort, STATE_DIR: stateDir, HOST_PIN: '1234', PUBLIC_BASE_URL: '', PHASE_DURATIONS_SCALE: '0.1' }, stdio: ['ignore', 'ignore', 'pipe'] });
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
        window.__qa = { events: [], sockets: [], paints: [], flashes: [], music: [], sparks: [], toasts: [], media: [] };
        Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
        Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: undefined, configurable: true });
        Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
        Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
        Object.defineProperty(navigator, 'mediaDevices', { value: {getUserMedia: async () => { throw Error('permission denied'); }}, configurable: true });
        new MutationObserver(() => {
          for (const testid of ['intro-approach','intro-aerial','matterport-still']) {
            const element = document.querySelector(`[data-testid="${testid}"]`);
            if (element && !element.dataset.qaSeen) { element.dataset.qaSeen='yes'; window.__qa.media.push({at:performance.now(),testid,text:element.textContent}); }
          }
          const f = document.querySelector('[data-testid="revival-flash"]');
          if (f && !f.dataset.qaSeen) { f.dataset.qaSeen = 'yes'; window.__qa.flashes.push({ at: performance.now(), soft: f.dataset.soft, duration: getComputedStyle(f).animationDuration, background: f.style.background }); }
        }).observe(document, { subtree: true, childList: true });
        const arc = CanvasRenderingContext2D.prototype.arc;
        CanvasRenderingContext2D.prototype.arc = function(...args) { if (this.canvas.dataset.testid === 'spark-canvas') window.__qa.sparks.push({ at: performance.now(), alpha: this.globalAlpha, radius: args[2] }); return arc.apply(this, args); };
        const Native = window.WebSocket;
        window.WebSocket = class extends Native {
          constructor(...args) { super(...args); window.__qa.sockets.push(this); this.addEventListener('message', (e) => { const event = JSON.parse(e.data); window.__qa.events.push({ at: performance.now(), ...event }); if (event.type === 'error') setTimeout(() => window.__qa.toasts.push({ code: event.code, message: event.message, shown: [...document.querySelectorAll('[role="alert"]')].some(el => el.textContent.includes(event.message)) }), 80); }); }
        };
      });
      return p;
    };
    const screenshot = async (label) => {
      result.layouts ??= [];
      for (const {p, label: name} of pages) result.layouts.push({ label, page: name, ...await p.evaluate(() => {
        const visible = [...document.querySelectorAll('p,li,td,th,small,figcaption,button')].filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height);
        return { viewport: [innerWidth,innerHeight], document: [document.documentElement.scrollWidth,document.documentElement.scrollHeight], smallText: visible.filter(e => parseFloat(getComputedStyle(e).fontSize) < 28).map(e => ({text:e.textContent.slice(0,100),size:getComputedStyle(e).fontSize})), clipped: visible.filter(e => {const r=e.getBoundingClientRect(); return r.right>innerWidth+1 || r.bottom>innerHeight+1 || r.left< -1;}).map(e => ({text:e.textContent.slice(0,100),rect:e.getBoundingClientRect().toJSON()})) };
      }) });
      await Promise.all(pages.map(async ({ p, label: name }) => { const file = `${mode}-${label}-${name}.png`; await p.screenshot({ path: join(artifacts, file) }); result.screenshots.push(file); }));
    };
    const check = async (name, fn) => {
      if (process.env.LO_QA_ONLY_CHECK && !process.env.LO_QA_ONLY_CHECK.split('|').includes(name) && name !== 'three phones join QR URL and mode is correct') return;
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
      await expect(phase(screen)).toHaveText('PITCH', {timeout:10000});
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
      await screen.evaluate(async () => {
        const { CityMusic, layerDb } = await import('/src/screen/music.ts');
        for (const method of ['revive', 'duck', 'signature', 'restore']) {
          const original = CityMusic.prototype[method];
          CityMusic.prototype[method] = function(...args) {
            const value = original.apply(this, args);
            window.__qa.music.push({ method, args, at: performance.now(), epoch: Date.now(), state: {...this.state}, db: Object.fromEntries(Object.keys(this.state).map(c => [c, layerDb(this.state, c, method === 'duck' && args[0])])) });
            return value;
          };
        }
      });
      await screen.getByRole('button', { name: 'Start audio', exact: true }).click();
      const joinURL = (await screen.locator('aside p').filter({ hasText: '/play?room=' }).innerText()).trim(); room = new URL(joinURL).searchParams.get('room');
      await admin.goto(`${base}/admin`); await admin.getByLabel('Host PIN').fill('1234');
      await screenshot('zero-players');
      await check('three phones join QR URL and mode is correct', async () => {
        for (const [i, name] of ['Ann', 'Bo', 'Cy'].entries()) { await phones[i].goto(joinURL); await phones[i].getByLabel('Nickname').fill(name); await phones[i].getByRole('button', { name: 'Join', exact: true }).tap(); await expect(phones[i].getByRole('heading', { name, exact: true })).toBeVisible(); await screenshot(`players-${i+1}`); }
        await expect(screen.locator('aside li')).toHaveCount(3); expect((await state()).data_mode).toBe(mode);
      });
      await check('both hero Vexcel footprints rendered with source coordinates', async () => {
        const geometry = await (await fetch(`${base}/floors.geojson`)).json();
        const details = [];
        for (const id of ['233953', '233899']) {
          const dossier = await (await fetch(`${api}/api/buildings/${id}`)).json();
          const features = geometry.features.filter((f) => f.properties.building_id === id);
          expect(features).toHaveLength(dossier.stories);
          for (const f of features) { expect(f.footprint_source).toBe('vexcel'); expect(f.geometry.coordinates).toEqual(dossier.footprint.coordinates); }
          await expect.poll(() => screen.evaluate((id) => window.__lightsOnMap.queryRenderedFeatures({ layers: ['floors'] }).some((f) => f.properties.building_id === id), id)).toBe(true);
          const estimates = dossier.facts.filter((f) => f.source === 'vexcel+vision');
          expect(estimates.length).toBeGreaterThan(0);
          for (const f of estimates) { expect(f.kind).toBe('estimate'); expect(f.say_as).toMatch(/20\d{2} flyover|unknown capture date/); }
          details.push({ id, renderedFloors: features.length, estimates: estimates.map((f) => ({ id: f.id, kind: f.kind, say_as: f.say_as })) });
        }
        return details;
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
        const d = await (await fetch(`${api}/api/buildings/233953`)).json();
        const hover = await screen.getByTestId('hover-card').innerText();
        expect(hover).toContain(`${d.stories} stories`);
        expect(hover).toContain(`${d.floors.filter((f) => f.source_status === 'dark').length} dark floors`);
        expect(hover).toContain(d.facts.find((f) => f.key === 'available_sqft').say_as);
        privacy(hover);
        return hover;
      });
      for (let n = 0; n < 5; n++) await check(`complete unmocked typed round ${n + 1}`, async () => {
        await expect(phase(screen)).toHaveText('EXPLORE');
        const bid = n < 4 ? '233953' : '233899', winner = n % 2;
        const before = await state(), dossier = await wake(bid), rid = (await state()).round_id;

        await expect(screen.getByTestId('subtitles')).toBeVisible();
        if (n === 0) {
          await expect(screen.getByTestId('intro-approach')).toBeVisible();
          await screenshot('INTRO-dive');
          shortShots.push(delay(2600).then(async () => {
            await screen.getByRole('button',{name:'Show caption still'}).click().catch(()=>{});
            await screen.screenshot({path:join(artifacts,`${mode}-INTRO-interior-screen.png`)});
          }).catch(()=>{}));
        }
        if (n === 0) {
          await expect(phase(screen)).toHaveText('PITCH',{timeout:10000});
          await phones[0].getByRole('button', { name: 'Hold to talk', exact: true }).tap();
          await expect(phones[0].getByRole('alert')).toContainText(/type/i);
        }
        await pitch(winner);
        if (n === 0) await screenshot('PITCH');
        await expect(phase(screen)).toHaveText('CHALLENGE');
        const challenges = (await state()).challenges; expect(challenges).toHaveLength(2);
        for (const c of challenges) { expect(c.counteroffer).toBeTruthy(); for (const id of c.fact_ids) { const fact = dossier.facts.find((f) => f.id === id); expect(fact?.value).not.toBeNull(); expect(c.line).toBeTruthy(); await expect(screen.getByRole('region', { name: 'Building counteroffers' })).toContainText(c.line); } }
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
        const visual = await screen.evaluate(() => {
          const e = window.__qa.events.filter(e => e.type === 'building_revived').at(-1);
          const f = window.__qa.flashes.find(f => f.at >= e.at);
          return { event: e, flash: f, latency: f?.at - e.at };
        });
        result.rounds.push({ round_id: rid, building_id: bid, floors: after.target_floors, visual, city: after.city });
        await check(`round ${n+1} flash and concept payoff`, async () => {
          expect(visual.latency).toBeGreaterThanOrEqual(0); expect(visual.latency).toBeLessThan(300);
          expect(visual.flash.duration).toBe('0.2s'); expect(visual.flash.soft).toBe('false');
          await expect(screen.getByTestId('concept-card')).toContainText('Game concept, not a real renovation');
          const detail = await screen.evaluate(() => {
            const e = window.__qa.events.filter(e => e.type === 'building_revived').at(-1);
            return { music: window.__qa.music.filter(m => m.at >= e.at), sparks: window.__qa.sparks.filter(s => s.at >= e.at).slice(0,70) };
          });
          const motif = detail.music.find(m => m.method === 'signature');
          expect(motif).toBeTruthy(); expect(motif.args[1] - motif.epoch).toBeGreaterThan(100); expect(motif.args[1] - motif.epoch).toBeLessThanOrEqual(200);
          expect(detail.sparks.length).toBeGreaterThan(0); expect(detail.music.some(m => m.method === 'revive')).toBe(true);
          if (n === 0) await screenshot('REVIVED-concept');
          const animation = await screen.evaluate(() => {
            const e = window.__qa.events.filter(e => e.type === 'building_revived').at(-1);
            return window.__qa.paints.filter(p => p.at >= e.at && p.at <= e.at + 1500).map(p => {
              const floors = {}; let x = p.expression;
              while (Array.isArray(x) && x[0] === 'case' && x[1]?.[0] === 'all') {
                if (x[1][1][2] === e.building_id) floors[x[1][2][2]] = Array.isArray(x[2]) ? x[2][2][1] : 1;
                x = x[3];
              }
              return { at: p.at-e.at, floors };
            });
          });
          detail.animation = animation;
          const floors = [...after.target_floors].sort((a,b)=>a-b);
          const mid = animation.find(p => p.floors[floors[0]] > 0.25 && p.floors[floors[0]] < 0.75);
          expect(mid).toBeTruthy();
          if (floors.length > 1) expect(mid.floors[floors[0]] - mid.floors[floors[1]]).toBeCloseTo(60/600, 2);
          const moving = animation.filter(p => p.floors[floors[0]] > 0 && p.floors[floors[0]] < 1);
          expect(moving.length).toBeGreaterThan(2);
          const first=moving[0], last=moving.at(-1);
          expect((last.at-first.at)/(last.floors[floors[0]]-first.floors[floors[0]])).toBeGreaterThan(550);
          expect((last.at-first.at)/(last.floors[floors[0]]-first.floors[floors[0]])).toBeLessThan(650);
          return detail;
        });
        await expect(phase(screen)).toHaveText('EXPLORE'); await colors(after);
        expect(events('building_revived')).toHaveLength(n + 1);
      });
      await check('INTRO aerial estimate and known date', async () => {
        const media = await screen.evaluate(() => window.__qa.media);
        result.media = media;
        expect(media.some(m => m.testid === 'intro-aerial' && m.text.includes('Estimate'))).toBe(true);
        return media;
      });
      await check('INTRO interior embed or caption still', async () => {
        const media = await screen.evaluate(() => window.__qa.media);
        expect(media.some(m => m.testid === 'matterport-still' && m.text.includes('Matterport'))).toBe(true); return media;
      });
      await check('four players projector layout', async () => {
        const fourth = await browser.newContext({...devices['Pixel 7']}); contexts.push(fourth);
        const p = await page(fourth, 'phone4'); await p.goto(joinURL); await p.getByLabel('Nickname').fill('Dee'); await p.getByRole('button', {name:'Join',exact:true}).tap();
        await expect(screen.locator('aside li')).toHaveCount(4); await screenshot('players-4');
      });
      await check('city music duplicate lift and speaking duck', async () => {
        const music = await screen.evaluate(() => window.__qa.music);
        const revives = music.filter(m => m.method === 'revive'); expect(revives).toHaveLength(5);
        const category = revives[0].args[0]; expect(revives[0].state[category]).toBe(0); expect(revives[1].state[category]).toBe(3);
        expect(revives[1].db[category] - revives[0].db[category]).toBe(3);
        const ducks = music.filter(m => m.method === 'duck' && m.state[category] !== null);
        expect(ducks.some(m => m.args[0] === true && m.db[category] === -32 + m.state[category])).toBe(true);
        expect(ducks.some(m => m.args[0] === false && m.db[category] === -24 + m.state[category])).toBe(true);
        return { revives, ducks };
      });
      await check('INTRO fixed deadline continues despite media and unavailable speech', async () => {
        const all = events('phase_changed');
        return result.rounds.map(r => { const intro = all.find(e => e.round_id === r.round_id && e.phase === 'INTRO'); const pitch = all.find(e => e.round_id === r.round_id && e.phase === 'PITCH'); expect(pitch.at - intro.at).toBeGreaterThanOrEqual(7900); expect(pitch.at-intro.at).toBeLessThan(8500); return pitch.at-intro.at; });
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
        expect((await state()).phase).toBe('EXPLORE'); await expect(phones[0].getByRole('alert')).toBeVisible();
      });
      await check('no_pitches timer returns to EXPLORE', async () => {
        await fresh(); const count = events('error').length; await wake('233899');
        await expect(phase(screen)).toHaveText('PITCH', {timeout:10000}); await expect(phase(screen)).toHaveText('EXPLORE', { timeout: 10000 });
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
        await expect(phase(screen)).toHaveText('REVIVED'); const after = await state(); expect(after.auto_completed).toBe(true); expect(after.charge).toBe(100); await expect(screen.getByTestId('energy-meter')).toContainText('city helped');
        await expect.poll(() => screen.evaluate(() => window.__qa.flashes.at(-1)?.soft)).toBe('true');
        await expect(screen.getByTestId('concept-card')).toBeVisible(); await screenshot('auto-complete');
        const evidence = await screen.evaluate(() => {
          const e = window.__qa.events.filter(e => e.type === 'building_revived').at(-1);
          return { flash:window.__qa.flashes.at(-1), sparks:window.__qa.sparks.filter(p => p.at >= e.at).slice(0,80) };
        });
        expect(evidence.flash.soft).toBe('true'); expect(evidence.flash.background).not.toBe('white');
        expect(evidence.sparks.some(p => p.radius === 2 && p.alpha <= 0.4)).toBe(true);
        await fresh(); return evidence;
      });
      await check('AudioContext unavailable still completes typed subtitle round', async () => {
        const noAudio = await browser.newContext({viewport:{width:1920,height:1080}}); contexts.push(noAudio);
        await noAudio.addInitScript(() => {
          Object.defineProperty(window, 'AudioContext', {value:undefined,configurable:true});
          Object.defineProperty(window, 'webkitAudioContext', {value:undefined,configurable:true});
        });
        const silent = await page(noAudio, 'audio-unavailable-screen'); await silent.goto(`${base}/screen`);
        await expect(silent.getByTestId('qr')).toBeVisible();
        await silent.getByRole('button', {name:'Start audio',exact:true}).click();
        await expect(silent.getByRole('alert')).toContainText('Audio unavailable');
        const url = (await silent.locator('aside p').filter({hasText:'/play?room='}).innerText()).trim();
        const controller = await browser.newContext({...devices['iPhone 13']}); contexts.push(controller);
        const p = await page(controller, 'audio-unavailable-phone'); await p.goto(url); await p.getByLabel('Nickname').fill('Silent'); await p.getByRole('button',{name:'Join',exact:true}).tap();
        await p.getByRole('button',{name:'Wake building Esperson',exact:true}).tap();
        await expect(silent.getByTestId('subtitles')).toBeVisible();
        await expect(phase(silent)).toHaveText('PITCH',{timeout:10000});
        await p.getByLabel('Your pitch').fill('A shared public gaming studio welcoming everyone'); await p.getByRole('button',{name:'Submit pitch',exact:true}).tap();
        await expect(phase(silent)).toHaveText('NEGOTIATE',{timeout:10000});
        await p.getByLabel('Your revision').fill('A shared public gaming studio welcoming everyone at night'); await p.getByRole('button',{name:'Send revision',exact:true}).tap();
        await expect(phase(silent)).toHaveText('REVIVED',{timeout:10000});
        await silent.screenshot({path:join(artifacts,`${mode}-audio-context-unavailable.png`)});
      });
      await check('host skip reset round reset room and data provider switch', async () => {
        await wake('233899'); await host('Skip phase'); await expect(phase(screen)).toHaveText('PITCH', {timeout:10000}); await fresh();
        const other = mode === 'kit' ? 'fixtures' : 'kit'; await host(`Data: ${other}`); await expect.poll(async () => (await state()).data_mode).toBe(other); expect((await (await fetch(`${api}/api/buildings/233953`)).json()).data_mode).toBe(other); await host(`Data: ${mode}`);
        await host('Reset room'); await expect(phase(screen)).toHaveText('LOBBY'); expect((await state()).city.song_layers).toBe(0); await expect(screen.locator('aside li')).toHaveCount(0);
      });
      await check('no model construction or spend ledger writes', async () => {
        await expect(readFile(join(stateDir, 'model-attempted'))).rejects.toThrow();
        await expect(readFile(join(root, 'server/state/bedrock_spend.json'))).rejects.toThrow();
      });
      await check('grounded API responses and rendered text contain no kit contacts', async () => {
        const buildings = await (await fetch(`${api}/api/buildings`)).json(); privacy(JSON.stringify(buildings));
        for (const b of buildings) privacy(JSON.stringify(await (await fetch(`${api}/api/buildings/${b.id}`)).json()));
        for (const { p } of pages) privacy(await p.locator('body').innerText()); privacy(JSON.stringify(result.events));
      });
      await check('every received error event displays a toast', async () => {
        const evidence = await Promise.all(pages.map(async ({p,label}) => ({page:label, toasts:await p.evaluate(() => window.__qa.toasts)})));
        expect(evidence.flatMap(e => e.toasts).length).toBeGreaterThan(0);
        expect(evidence.flatMap(e => e.toasts).filter(t => !t.shown)).toEqual([]); return evidence;
      });
      await check('phone controls no horizontal overflow', () => {
        expect(result.layouts.filter(l => l.page.startsWith('phone')).filter(l => l.document[0] > l.viewport[0])).toEqual([]);
      });
      await check('projector >=28px body text and no clipped content', () => {
        const layouts = result.layouts.filter(l => l.page === 'screen');
        expect(layouts.flatMap(l => l.smallText)).toEqual([]); expect(layouts.flatMap(l => l.clipped)).toEqual([]);
      });
      await check('no console exception or network errors outside deliberate restart', () => { expect(result.errors.filter((e) => !e.restarting && !(e.kind === 'network' && e.text === 'net::ERR_ABORTED'))).toEqual([]); });
    } catch (e) { result.checks.push({ name: 'setup', pass: false, error: e.stack }); }
    finally { await Promise.all(shortShots); await Promise.all(contexts.map((c) => c.close())); await stop(backend); await writeFile(join(artifacts, 'results.json'), JSON.stringify(report, null, 2)); }
    console.log(`${mode}: ${result.checks.filter((c) => c.pass).length}/${result.checks.length} passed`);
  }
} finally { await browser.close(); await stop(web); }
report.spendAfter = await spendTotal();
expect(report.spendAfter).toBe(initialSpend);
await writeFile(join(artifacts, 'results.json'), JSON.stringify(report, null, 2));
if (report.modes.some((m) => m.checks.some((c) => !c.pass))) process.exitCode = 1;
