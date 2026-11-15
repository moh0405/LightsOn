import { test, expect, chromium, type Page, type Browser } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

type Row = Record<string, unknown>;
const out = '/tmp/lights-visible-run/rerun';
// Point at the checkout owning the already-running server; never start a server here.
const demoRoot = process.env.VISIBLE_DEMO_ROOT ?? resolve('../..');
const ledgerPath = resolve(demoRoot, 'server/state/bedrock_spend.json');
const ledger = () => JSON.parse(readFileSync(ledgerPath, 'utf8')) as { total_usd: number; calls: Row[] };

test('one audible, headed Esperson round with natural timers', async ({ request, baseURL }) => {
  mkdirSync(out, { recursive: true });
  const health = await request.get('http://127.0.0.1:8000/api/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ ok: true, data_mode: 'kit', demo_mode: true });
  const before = ledger(); expect(before.total_usd).toBeLessThanOrEqual(4.20);
  // python-dotenv reads the PIN without logging it or putting it in a URL.
  const pin = execFileSync(resolve(demoRoot, 'server/.venv/bin/python'), ['-c',
    'from dotenv import dotenv_values; import sys; sys.stdout.write(dotenv_values(sys.argv[1])["HOST_PIN"])', resolve(demoRoot, '.env')], { encoding: 'utf8' });
  const result: Row = { started: new Date().toISOString(), before: before.total_usd, beats: [], errors: [], phoneErrors: [] };
  const beats = result.beats as Row[], errors = result.errors as Row[];
  const browsers: Browser[] = [];
  let screen: Page | undefined;
  const save = () => writeFileSync(`${out}/evidence.json`, JSON.stringify(result, null, 2));
  const launch = async (x: number, width: number, height: number) => {
    if (browsers[0]) return browsers[0];
    const b = await chromium.launch({ channel: 'chrome', headless: false, ignoreDefaultArgs: ['--enable-automation', '--mute-audio', '--enable-unsafe-swiftshader'],
      args: ['--disable-blink-features=AutomationControlled', '--autoplay-policy=no-user-gesture-required', `--window-position=${x},25`, `--window-size=${width},${height + 90}`] });
    browsers.push(b); return b;
  };
  try {
    const desktop = await (await launch(0, 1920, 1080)).newContext({ viewport: { width: 1920, height: 1080 } });
    await desktop.addInitScript(() => {
      const rows: Record<string, unknown>[] = [], wire: Record<string, unknown>[] = [], samples: Record<string, unknown>[] = [];
      const frames: { ms: number; delta: number }[] = [];
      let previous = performance.now();
      const frame = (ms: number) => { frames.push({ ms, delta: ms - previous }); previous = ms; requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
      Object.assign(window, { visibleRun: { rows, wire, samples, frames } });
      let seq = 0;
      const log = (event: string, fields: Record<string, unknown> = {}) => rows.push({ ms: performance.now(), event, ...fields });
      const native = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = u => {
        const id = ++seq; log('speak', { id, text: u.text, volume: u.volume, voice: u.voice?.name });
        for (const event of ['start', 'boundary', 'end', 'error'] as const) u.addEventListener(event, e => log(event, { id, text: u.text, charIndex: e.charIndex, error: 'error' in e ? e.error : undefined }));
        native(u);
      };
      const cancel = speechSynthesis.cancel.bind(speechSynthesis);
      speechSynthesis.cancel = () => { log('cancel', { speaking: speechSynthesis.speaking }); cancel(); };
      const Native = WebSocket;
      window.WebSocket = class extends Native {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          this.addEventListener('message', e => { try {
            const m = JSON.parse(String(e.data));
            wire.push({ ms: performance.now(), ...m });
            if (m.type === 'phase_changed') log('phase', { phase: m.phase, speaking: speechSynthesis.speaking, pending: speechSynthesis.pending });
          } catch { /* non-JSON transport */ } });
        }
      };
      addEventListener('DOMContentLoaded', () => setInterval(() => {
        const visible = (s: string) => [...document.querySelectorAll(s)].some(e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden');
        samples.push({ ms: performance.now(), phase: document.querySelector('[data-testid="phase"]')?.textContent,
          text: document.body.innerText, aerial: visible('[data-testid="intro-aerial"]'), tour: visible('[data-testid="matterport-still"]'),
          tourStatus: document.querySelector('.tour-frame')?.getAttribute('data-status'), score: visible('[data-testid="score-card"]'), concept: visible('[data-testid="concept-card"]'), visibility: document.visibilityState });
      }, 200));
    });
    screen = await desktop.newPage();
    screen.on('console', m => { if (m.type() === 'error') errors.push({ type: 'console', text: m.text(), location: m.location() }); });
    screen.on('pageerror', e => errors.push({ type: 'pageerror', text: e.message }));
    await screen.goto(`${baseURL}/screen`);
    expect(await screen.evaluate(() => navigator.webdriver)).toBe(false);
    expect(await screen.evaluate(() => new SpeechSynthesisUtterance('Ready').volume)).toBeGreaterThan(0);
    result.display = await screen.evaluate(() => ({ availableWidth: window.screen.availWidth, availableHeight: window.screen.availHeight, width: innerWidth, height: innerHeight, webdriver: navigator.webdriver }));
    const beat = async (name: string) => { beats.push({ name, ms: await screen!.evaluate(() => performance.now()) }); save(); console.log(name);  };
    const pause = () => screen!.waitForTimeout(1000);
    const phase = screen.getByTestId('phase').locator('strong');
    await expect(screen.getByTestId('qr')).toBeVisible();
    const start = screen.getByRole('button', { name: 'Start audio', exact: true });
    if (await start.isVisible()) await start.click();
    await expect.poll(() => screen!.evaluate(() => !!window.__lightsOnMap?.getLayer('floors')), { timeout: 30000 }).toBe(true);
    result.renderer = await screen.evaluate(() => {
      const gl = window.__lightsOnMap!.getCanvas().getContext('webgl2')!;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unavailable';
    });
    console.log('Renderer:', result.renderer);
    expect(String(result.renderer)).not.toMatch(/swiftshader|software|llvmpipe|unavailable/i);
    await beat('skyline-fps-start'); await screen.waitForTimeout(5000); await beat('skyline-fps-end');
    await beat('01-skyline');
    const join = (await screen.locator('.join-url').innerText()).trim();
    const phones: Page[] = [];
    for (const [i, name] of ['Maya', 'Leo'].entries()) {
      const c = await (await launch(1920 + i * 400, 390, 844)).newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const p = await c.newPage(); phones.push(p);
      const cdp = await c.newCDPSession(p);
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 1120 + i * 400, top: 110, width: 390, height: 930 } });
      p.on('pageerror', e => (result.phoneErrors as string[]).push(e.message));
      await p.goto(join); await p.getByLabel('Nickname').pressSequentially(name, { delay: 90 }); await pause();
      await p.getByRole('button', { name: 'Join', exact: true }).tap(); await pause();
    }
    await screen.bringToFront();
    await expect(phase).toHaveText('EXPLORE');
    await expect.poll(() => screen!.evaluate(() => !!window.__lightsOnMap?.getLayer('floors'))).toBe(true);
    await expect.poll(() => screen!.evaluate(() => !window.__lightsOnMap!.isMoving())).toBe(true);
    const hit = await screen.evaluate(() => {
      const map = window.__lightsOnMap!, c = map.getCanvas();
      for (let y = 40; y < c.clientHeight - 40; y += 7) for (let x = 40; x < c.clientWidth - 40; x += 7)
        if (String(map.queryRenderedFeatures([x, y], { layers: ['floors'] })[0]?.properties?.building_id) === '233953') return { x: x / c.clientWidth, y: y / c.clientHeight };
      throw new Error('Esperson not rendered');
    });
    const pad = (await phones[0]!.getByTestId('trackpad').boundingBox())!;
    await phones[0]!.touchscreen.tap(pad.x + pad.width * hit.x, pad.y + pad.height * hit.y);
    await expect(screen.getByTestId('hover-card')).toContainText('Esperson'); await pause();
    result.pointerLabel = await screen.getByTestId('pointer-label').boundingBox();
    const tower = await screen.evaluate(async () => {
      const map = window.__lightsOnMap!, source = map.getSource("floors");
      if (!source || source.type !== "geojson") throw new Error("Missing floors");
      const floors = await source.getData();
      if (floors.type !== "FeatureCollection") throw new Error("Missing features");
      const matrix = map._camera.transform.getProjectionDataForCustomLayer(true).mainMatrix;
      const canvas = map.getCanvas(), origin = canvas.getBoundingClientRect(), points: number[][] = [];
      for (const f of floors.features.filter(f => String(f.properties?.building_id) === "233953")) {
        const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
        for (const polygon of polygons) for (const p of polygon[0] ?? []) for (const z of [0, Number(f.properties?.height_m)]) {
          const lat = p[1]! * Math.PI / 180;
          const v = [(p[0]! + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2, z / (40075016.68557849 * Math.cos(lat)), 1];
          const out = [0, 1, 2, 3].map(row => v.reduce((sum, n, col) => sum + n * matrix[col * 4 + row]!, 0));
          points.push([origin.x + (out[0]! / out[3]! + 1) * canvas.clientWidth / 2, origin.y + (1 - out[1]! / out[3]!) * canvas.clientHeight / 2]);
        }
      }
      if (!points.length) throw new Error("Missing Esperson geometry");
      return { left: Math.min(...points.map(p => p[0]!)), right: Math.max(...points.map(p => p[0]!)), top: Math.min(...points.map(p => p[1]!)), bottom: Math.max(...points.map(p => p[1]!)) };
    });
    const label = (await screen.getByTestId('pointer-label').boundingBox())!;
    result.pointerOutside = label.x >= tower.right || label.x + label.width <= tower.left || label.y >= tower.bottom || label.y + label.height <= tower.top;
    await beat('02-aim');
    await phones[0]!.getByRole('button', { name: 'Wake building Esperson', exact: true }).tap();
    await expect(phase).toHaveText('INTRO'); await screen.bringToFront(); await beat('03-intro');
    await screen.waitForTimeout(5000); await beat('04-lobby-tour');
    await expect(phase).toHaveText('PITCH', { timeout: 40000 });
    const pitches = ['A board-game cafe with paid tables and free community nights on one dark floor.', 'A coworking and training hub with flexible desks and evening workshops for small businesses.'];
    for (const [i, p] of phones.entries()) {
      await p.getByLabel('Your pitch').pressSequentially(pitches[i]!, { delay: 45 }); await pause();
      await p.getByRole('button', { name: 'Submit pitch', exact: true }).tap(); await pause();
    }
    await screen.bringToFront(); await beat('05-pitches');
    await expect(phase).toHaveText('CHALLENGE', { timeout: 35000 }); await beat('06-challenge');
    await expect(phase).toHaveText('NEGOTIATE', { timeout: 40000 });
    result.challenges = await screen.getByRole('region', { name: 'Building counteroffers' }).innerText();
    await phones[0]!.getByLabel('Your revision').pressSequentially('Start small on one listed available floor, with member-supported tables and free weekly community nights.', { delay: 45 });
    await pause(); await phones[0]!.getByRole('button', { name: 'Send revision', exact: true }).tap(); await pause();
    await screen.bringToFront(); await beat('07-revision');
    await expect(phase).toHaveText('VERDICT', { timeout: 40000 });
    // VERDICT begins before model work completes; allow its bounded live timeout.
    await expect(screen.getByTestId('score-card')).toBeVisible({ timeout: 45000 });
    result.verdict = await screen.getByTestId('score-card').innerText(); await beat('08-verdict');
    await expect(phase).toHaveText('POWER_UP', { timeout: 30000 }); await beat('09-power-up');
    for (let i = 0; i < 2; i++) for (const p of phones) { await p.getByRole('button', { name: 'Tap to charge', exact: true }).tap(); await pause(); }
    await expect(phase).toHaveText('REVIVED', { timeout: 40000 }); await screen.bringToFront();
    await expect(screen.getByTestId('energy-meter')).toContainText('100%'); await beat('10-light-up');
    await expect(screen.getByTestId('concept-card')).toBeVisible({ timeout: 6000 });
    result.city = await screen.getByTestId('city-meter').innerText(); await beat('11-concept');
    await screen.waitForTimeout(5000); await beat('light-up-fps-end');
    await expect(phase).toHaveText('EXPLORE', { timeout: 35000 });
    await screen.keyboard.press('m'); await expect(screen.getByRole('region', { name: 'Walk inside', exact: true })).toBeVisible();
    await screen.waitForTimeout(7000); await beat('12-walk-in'); await screen.keyboard.press('Escape'); await pause();
    await screen.keyboard.press('t'); await expect(screen.getByTestId('trace-panel')).toBeVisible();
    await beat('13-trace'); await screen.waitForTimeout(3000); await screen.keyboard.press('Escape'); await pause();
    await screen.keyboard.press('h'); await expect(screen.getByRole('region', { name: 'Host controls' })).toBeVisible();
    await beat('14-host'); await screen.getByLabel('Host PIN').fill(pin); await pause();
    await screen.getByRole('button', { name: 'Reset room', exact: true }).click();
    await expect(phase).toHaveText('LOBBY'); await screen.keyboard.press('Escape'); await beat('15-reset');
    await screen.waitForTimeout(20000); result.complete = true;
  } catch (e) {
    result.failure = String(e); throw e;
  } finally {
    if (screen) {
      result.instrument = await screen.evaluate(() => Reflect.get(window, 'visibleRun')).catch(() => null);
      const instrument = result.instrument as { frames: { ms: number; delta: number }[]; rows: Row[] } | null;
      if (instrument) {
        const windows = {
          skyline: Number(beats.find(b => b.name === 'skyline-fps-start')?.ms),
          dive: Number(instrument.rows.find(r => r.event === 'phase' && r.phase === 'INTRO')?.ms),
          lightUp: Number(instrument.rows.find(r => r.event === 'phase' && r.phase === 'REVIVED')?.ms),
        };
        result.frameMetrics = Object.fromEntries(Object.entries(windows).map(([name, start]) => {
          const frames = instrument.frames.filter(f => f.ms >= start && f.ms <= start + 5000);
          return [name, frames.length ? { fps: frames.length * 1000 / frames.reduce((sum, f) => sum + f.delta, 0),
            longestFrameMs: Math.max(...frames.map(f => f.delta)), framesOver50Ms: frames.filter(f => f.delta > 50).length } : null];
        }));
        console.log('Frame metrics:', JSON.stringify(result.frameMetrics));
      }
      // No video, screencast, or tracing: avoid encoding contention during the live demo.
      await screen.screenshot({ path: `${out}/final.png` }).catch(() => {});
    }
    // Reservations can exceed final usage while requests are still in flight.
    for (let i = 0; i < 30 && ledger().calls.slice(before.calls.length).some(c => c.status === 'unconfirmed'); i++)
      await new Promise(resolve => setTimeout(resolve, 1000));
    const after = ledger(); result.after = after.total_usd; result.spend = after.total_usd - before.total_usd;
    result.calls = after.calls.slice(before.calls.length); save();
    for (const b of browsers) { for (const c of b.contexts()) await c.close(); await b.close(); }
  }
  expect(Number(result.spend), 'shared-ledger delta within requested budget').toBeLessThanOrEqual(0.12);
});
