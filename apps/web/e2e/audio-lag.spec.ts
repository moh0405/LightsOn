import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { audioMetrics } from './audio-lag-metrics';

type Entry = { ms: number; event: string; id?: number; type?: string; text?: string; line?: number; duration?: number; speaking?: boolean; pending?: boolean; error?: string; voices?: number; value?: string };

// Opt in: this uses actual OS voices and takes several minutes, unlike speech mocks.
test.skip(!process.env.AUDIO_LAG_MEASURE, 'Native audio measurement is opt-in');
// Demo path: the demo preset's real phase timers, no host skips (Esperson only).
const realtime = !!process.env.AUDIO_LAG_REALTIME;
const ids = realtime || process.env.AUDIO_LAG_AGENT === 'recorded' ? ['233953'] : ['233899', '233905', '233918', '233928', '233935', '233953', '519027'];
for (const mode of (process.env.AUDIO_LAG_DATA ? [process.env.AUDIO_LAG_DATA] : ['kit'])) for (const building of ids) {
  test(`native audio ${mode} ${building} ${process.env.AUDIO_LAG_AGENT ?? 'fake'}`, async ({ browser, baseURL }, info) => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    let measuredPage: Page | undefined;
    const mobiles = await Promise.all([0, 1].map(() => browser.newContext()));
    try {
      await context.addInitScript(() => {
        const events: Entry[] = [];
        const lines: { id: number; text: string; consumed: string; key: string }[] = [];
        const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
        const log = (event: string, data: Omit<Entry, 'event' | 'ms'> = {}) => events.push({ ms: performance.now(), event, ...data });
        Object.assign(window, { audioLag: events, audioLagLog: log });
        const Native = window.WebSocket;
        window.WebSocket = class extends Native {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);
            if (new URL(url, location.href).searchParams.get('role') !== 'screen') return;
            this.addEventListener('message', e => {
              const raw = JSON.parse(String(e.data));
              if (raw.type === 'phase_changed') log('phase', { value: raw.phase });
              const m = raw.type === 'room_state' && raw.phase === 'VERDICT' && raw.verdict ? { ...raw.verdict, type: 'verdict' } : raw;
              if (['building_intro', 'counteroffer', 'verdict'].includes(m.type)) {
                const text = clean(m.text ?? (m.reason_line ?? `${m.line} ${m.counteroffer}`));
                const key = `${m.type}:${m.player_id ?? ''}:${text}`;
                if (lines.some(l => l.key === key)) return;
                const id = lines.length;
                lines.push({ id, text, consumed: '', key });
                log('message', { id, type: m.type, text, value: m.type === 'counteroffer' && !m.counteroffer.trim() && !m.fact_ids.length ? 'preliminary' : undefined });
                const visible = () => [...document.querySelectorAll('[data-testid="subtitles"], .challenge-card, [data-testid="score-card"]')].some(el => clean(el.textContent ?? '').includes(clean(m.text ?? m.reason_line ?? m.line)));
                if (visible()) log('subtitle', { id });
                else {
                  const observer = new MutationObserver(() => { if (visible()) { log('subtitle', { id }); observer.disconnect(); } });
                  observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
                  setTimeout(() => observer.disconnect(), 10000);
                }
              }
            });
          }
        };
        let utterance = 0;
        const synth = speechSynthesis;
        const voices = synth.getVoices.bind(synth);
        synth.getVoices = () => { const start = performance.now(), result = voices(); log('getVoices', { duration: performance.now() - start, voices: result.length }); return result; };
        synth.addEventListener('voiceschanged', () => log('voiceschanged', { voices: voices().length }));
        const speak = synth.speak.bind(synth);
        synth.speak = u => {
          const id = utterance++;
          const text = clean(u.text);
          // A budgeted challenge speaks a part of its line; match that by containment.
          const line = lines.find(l => clean(l.text.slice(l.consumed.length)).startsWith(text))
            ?? lines.find(l => l.key.startsWith('counteroffer:') && !l.consumed && l.text.includes(text.replace(/…$/, '')));
          if (line) line.consumed += `${line.consumed ? ' ' : ''}${text}`;
          const data = { id, line: line?.id, text, speaking: synth.speaking, pending: synth.pending };
          log('speak', data);
          for (const event of ['start', 'end', 'error'] as const) u.addEventListener(event, e => log(event, { ...data, error: 'error' in e ? String(e.error) : undefined }));
          speak(u);
        };
        const cancel = synth.cancel.bind(synth);
        synth.cancel = () => { log('cancel'); cancel(); };
        const resume = synth.resume.bind(synth);
        synth.resume = () => { log('resume'); resume(); };
        const NativeAudio = window.AudioContext;
        if (NativeAudio) window.AudioContext = class extends NativeAudio {
          constructor(options?: AudioContextOptions) { super(options); log('AudioContext', { value: this.state }); this.addEventListener('statechange', () => log('AudioContext', { value: this.state })); }
        };
        new PerformanceObserver(list => list.getEntries().forEach(e => log('longtask', { ms: e.startTime, duration: e.duration } as Omit<Entry, 'event' | 'ms'>))).observe({ type: 'longtask', buffered: true });
        let last = performance.now();
        const frame = (now: number) => { log('frame', { duration: now - last }); last = now; requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
      });
      const screen = await context.newPage(); measuredPage = screen;
      const cdp = process.env.AUDIO_LAG_TRACE ? await context.newCDPSession(screen) : null;
      if (cdp) await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8.execute,disabled-by-default-devtools.timeline,disabled-by-default-v8.cpu_profiler', transferMode: 'ReturnAsStream' });
      screen.on('pageerror', e => errors.push(e.message));
      screen.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      // External tour network noise is excluded; local media, map, Tone and native speech stay real.
      await screen.route('https://my.matterport.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Offline tour caption fallback</p>' }));
      // Reproducible unavailable-provider delay, without spending on a voice API.
      if (process.env.AUDIO_LAG_TTS_DELAY) await screen.route('**/api/tts', async route => {
        await new Promise(resolve => setTimeout(resolve, Number(process.env.AUDIO_LAG_TTS_DELAY)));
        await route.fulfill({ json: { audio_url: null } });
      });
      await screen.goto(`${baseURL}/screen`);
      await expect(screen.getByTestId('qr')).toBeVisible();
      await expect.poll(() => screen.evaluate(() => !!window.__lightsOnMap?.getLayer('floors'))).toBe(true);
      await screen.getByRole('button', { name: 'Start audio', exact: true }).click();
      await expect(screen.getByRole('button', { name: 'Start audio', exact: true })).toHaveCount(0);
      await screen.evaluate(async musicStress => {
        // @ts-expect-error Vite browser import.
        const { CityMusic, categoryLayers } = await import('/src/screen/music.ts');
        const log = Reflect.get(window, 'audioLagLog');
        for (const key of ['duck', 'revive', 'signature'] as const) {
          const original = CityMusic.prototype[key];
          CityMusic.prototype[key] = function (...args: unknown[]) {
            log(key, { value: String(args[0]) });
            if (key === 'duck' && args[0] && musicStress) this.restore(Object.keys(categoryLayers));
            return Reflect.apply(original, this, args);
          };
        }
      }, !!process.env.AUDIO_LAG_MUSIC_STRESS);
      const joinURL = (await screen.locator('aside p').filter({ hasText: '/play?room=' }).innerText()).trim();
      const room = new URL(joinURL).searchParams.get('room')!;
      await screen.evaluate(async room => {
        const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws/${room}?role=admin`);
        Reflect.set(window, 'audioLagHost', ws);
        await new Promise<void>(resolve => ws.addEventListener('open', () => resolve(), { once: true }));
      }, room);
      const command = (data: object) => screen.evaluate(data => new Promise<void>((resolve, reject) => {
        const ws = Reflect.get(window, 'audioLagHost') as WebSocket;
        const nonce = crypto.randomUUID();
        const timeout = setTimeout(() => { ws.removeEventListener('message', receive); reject(new Error('Host ack timed out')); }, 10000);
        const receive = (event: MessageEvent) => {
          const m = JSON.parse(String(event.data));
          if (m.nonce !== nonce) return;
          clearTimeout(timeout); ws.removeEventListener('message', receive);
          if (m.type === 'error') reject(new Error(m.message)); else resolve();
        };
        ws.addEventListener('message', receive); ws.send(JSON.stringify({ ...data, nonce }));
      }), data);
      const host = async (action = 'skip_phase', extra = {}) => { if (!realtime || action !== 'skip_phase') await command({ type: 'host_action', room, pin: '1234', action, ...extra }); };
      if (mode !== 'kit') await host('set_data_mode', { data_mode: mode });
      const phones: Page[] = [];
      for (const name of ['Ann', 'Bo']) {
        const phone = await mobiles[phones.length]!.newPage(); phones.push(phone);
        await phone.goto(joinURL); await phone.getByLabel('Nickname').fill(name); await phone.getByRole('button', { name: 'Join', exact: true }).click();
      }
      // The authoritative wake list excludes unprepared heroes.
      await screen.evaluate(async () => {
        // @ts-expect-error Vite browser import.
        const { useGame } = await import('/src/lib/store.ts');
        const state = useGame.getState();
        Reflect.set(window, 'wakeableIds', state.heroIds);
      });
      test.skip(!(await screen.evaluate(() => Reflect.get(window, 'wakeableIds')) as string[]).includes(building), 'Server excludes this unprepared hero from the wake list');
      const name = (await screen.request.get(`/api/buildings/${building}`).then(r => r.json())).name;
      await phones[0]!.getByRole('button', { name: `Wake building ${name}`, exact: true }).click();
      const timeline = () => screen.evaluate(() => Reflect.get(window, 'audioLag') as Entry[]);
      const waitSpeech = async (type: string, minLines: number) => {
        if (realtime) return;
        await expect.poll(async () => (await timeline()).filter(e => e.event === 'message' && e.type === type && e.value !== 'preliminary').length, { timeout: 20000 }).toBeGreaterThanOrEqual(minLines);
        await expect.poll(async () => {
          const entries = await timeline();
          const messages = entries.filter(e => e.event === 'message' && e.type === type && e.value !== 'preliminary');
          return messages.slice(-minLines).every(m => {
            const ended = entries.filter(e => e.event === 'end' && e.line === m.id).map(e => e.text).join(' ').replace(/\s+/g, ' ').trim();
            // Browser sanitizes markup; recorded persona repair is already in payload.
            return ended === m.text;
          });
        }, { timeout: 100000 }).toBe(true);
      };
      await waitSpeech('building_intro', 1); console.log(`${building}: intro completed`);
      await host();
      await expect(screen.getByTestId('phase')).toContainText('PITCH', { timeout: 60000 });
      for (const [i, phone] of phones.entries()) {
        await phone.getByLabel('Your pitch').fill(i === 0 ? 'gym' : 'A public art studio');
        await phone.getByRole('button', { name: 'Submit pitch', exact: true }).click();
      }
      await host();
      await waitSpeech('counteroffer', 2);
      console.log(`${building}: counteroffers completed`);
      await host();
      await expect(screen.getByTestId('phase')).toContainText('NEGOTIATE', { timeout: 60000 });
      await phones[0]!.getByLabel('Your revision').fill('A public gym welcoming everyone at night');
      await phones[0]!.getByRole('button', { name: 'Send revision', exact: true }).click();
      await host();
      await waitSpeech('verdict', 1); console.log(`${building}: verdict completed`);
      await host();
      await expect(screen.getByTestId('phase')).toContainText('POWER_UP', { timeout: 60000 });
      for (let i = 0; i < 2; i++) {
        for (const phone of phones) await phone.getByRole('button', { name: 'Tap to charge', exact: true }).click();
        if (i === 0) await screen.waitForTimeout(650);
      }
      await expect(screen.getByTestId('phase')).toContainText('REVIVED', { timeout: 60000 });
      await screen.waitForTimeout(2500);
      if (cdp) {
        const done = new Promise<{ stream: string }>(resolve => cdp.once('Tracing.tracingComplete', resolve));
        await cdp.send('Tracing.end');
        const { stream } = await done;
        let trace = '';
        while (true) { const chunk = await cdp.send('IO.read', { handle: stream }); trace += chunk.data; if (chunk.eof) break; }
        await cdp.send('IO.close', { handle: stream });
        const tracePath = info.outputPath('cpu-trace.json'); writeFileSync(tracePath, trace);
        await info.attach('CPU trace', { path: tracePath, contentType: 'application/json' });
        if (process.env.AUDIO_LAG_OUTPUT) { mkdirSync(process.env.AUDIO_LAG_OUTPUT, { recursive: true }); writeFileSync(join(process.env.AUDIO_LAG_OUTPUT, `cpu-${building}.json`), trace); }
      }
      const renderer = await screen.evaluate(() => {
        const gl = window.__lightsOnMap?.getCanvas().getContext('webgl2');
        const extension = gl?.getExtension('WEBGL_debug_renderer_info');
        return gl && extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable';
      });
      const entries = await timeline();
      const metrics = audioMetrics(entries);
      console.log(`${building} native metrics: ${JSON.stringify(metrics)}`);
      const path = info.outputPath('timeline.json');
      const report = { building, name, mode, renderer, musicStress: !!process.env.AUDIO_LAG_MUSIC_STRESS, providerDelayMs: Number(process.env.AUDIO_LAG_TTS_DELAY ?? 0), agent: process.env.AUDIO_LAG_AGENT ?? 'fake', errors, metrics, entries };
      writeFileSync(path, JSON.stringify(report, null, 2));
      await info.attach('native timeline', { path, contentType: 'application/json' });
      if (process.env.AUDIO_LAG_OUTPUT) { mkdirSync(process.env.AUDIO_LAG_OUTPUT, { recursive: true }); writeFileSync(join(process.env.AUDIO_LAG_OUTPUT, `${mode}-${building}-${report.agent}.json`), JSON.stringify(report, null, 2)); }
      expect(errors).toEqual([]);
      if (!realtime) expect(entries.filter(e => e.event === 'error')).toEqual([]);
      if (realtime) {
        await screen.screenshot({ path: info.outputPath('demo-revived.png') });
        const phaseAt = (phase: string) => entries.find(e => e.event === 'phase' && e.value === phase)?.ms ?? Infinity;
        const challenges = metrics.rows.filter(r => r.type === 'counteroffer');
        const spoken = entries.filter(e => e.event === 'start' && challenges.some(r => r.id === e.line));
        const summary = { firstWord: Object.fromEntries(['building_intro', 'counteroffer', 'verdict'].map(t => [t, metrics.rows.find(r => r.type === t)?.firstWord])),
          challengeStarts: spoken.map(e => ({ line: e.line, afterChallenge: e.ms - phaseAt('CHALLENGE'), text: e.text })),
          lastChallengeEndBeforeNegotiate: phaseAt('NEGOTIATE') - Math.max(...entries.filter(e => e.event === 'end' && challenges.some(r => r.id === e.line)).map(e => e.ms)),
          cancels: entries.filter(e => e.event === 'cancel').map(e => e.ms), interrupted: entries.filter(e => e.event === 'error').map(e => `${e.error}: ${e.text}`),
          phases: entries.filter(e => e.event === 'phase').map(e => `${e.value}@${Math.round(e.ms)}`), maxChunkGap: metrics.maxChunkGap, maxLongTask: metrics.maxLongTask };
        console.log(`${building} demo-path: ${JSON.stringify(summary)}`);
        if (process.env.AUDIO_LAG_ASSERT) {
          for (const type of ['building_intro', 'counteroffer', 'verdict']) expect(summary.firstWord[type], `${type} first word`).toBeLessThanOrEqual(300);
          // A07: both players are challenged aloud, and every spoken challenge ends inside CHALLENGE.
          expect(new Set(spoken.map(e => e.line)).size, 'each challenge is spoken').toBe(2);
          expect(summary.lastChallengeEndBeforeNegotiate, 'challenge speech ends before NEGOTIATE').toBeGreaterThanOrEqual(0);
          expect(metrics.maxChunkGap).toBeLessThanOrEqual(250);
          expect(metrics.longTasksOver100).toBe(0);
          expect(metrics.provisionalSpoken).toBe(0);
        }
      } else if (process.env.AUDIO_LAG_ASSERT) {
        for (const [i, row] of metrics.rows.entries()) {
          expect(row.completed, `${row.type} completed`).toBe(true);
          expect(row.subtitle, `${row.type} subtitle available`).not.toBeNull();
          expect(row.subtitle!, `${row.type} subtitle latency`).toBeLessThanOrEqual(100);
          if (!metrics.rows.slice(0, i).some(r => r.type === row.type)) expect(row.firstWord!, `${row.type} first word`).toBeLessThanOrEqual(300);
          expect(row.readyToStart!, `${row.type} ready to start`).toBeLessThanOrEqual(300);
        }
        expect(metrics.maxChunkGap).toBeLessThanOrEqual(250);
        expect(metrics.maxLineGap).toBeLessThanOrEqual(250);
        expect(metrics.longTasksOver100).toBe(0);
        expect(metrics.provisionalSpoken).toBe(0);
      }
    } finally {
      if (measuredPage && !measuredPage.isClosed() && process.env.AUDIO_LAG_OUTPUT) {
        const entries = await measuredPage.evaluate(() => Reflect.get(window, 'audioLag')).catch(() => []);
        mkdirSync(process.env.AUDIO_LAG_OUTPUT, { recursive: true });
        writeFileSync(join(process.env.AUDIO_LAG_OUTPUT, `${mode}-${building}-${process.env.AUDIO_LAG_AGENT ?? 'fake'}-raw.json`), JSON.stringify({ building, mode, errors, entries }, null, 2));
      }
      await Promise.all([context, ...mobiles].map(c => c.close()));
    }
  });
}

// A short, labelled synthetic pointer probe isolates React/map work from network
// and OS voice timing. Normal game rules only send pointers during EXPLORE.
test('pointer traffic does not rerender the projector overlays', async ({ page }, info) => {
  await page.addInitScript(() => {
    const commits: string[] = [];
    let previous = new WeakSet<object>();
    Reflect.set(window, 'pointerCommits', commits);
    interface Fiber { type?: { name?: string }; flags: number; child?: Fiber; sibling?: Fiber }
    Reflect.set(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      supportsFiber: true, renderers: new Map(), inject: () => 1,
      onCommitFiberRoot: (_id: number, root: { current: Fiber }) => {
        const next = new WeakSet<object>();
        const visit = (fiber?: Fiber) => {
          if (!fiber) return;
          next.add(fiber);
          if (!previous.has(fiber) && (fiber.flags & 1) && fiber.type?.name) commits.push(fiber.type.name);
          visit(fiber.child); visit(fiber.sibling);
        };
        visit(root.current); previous = next;
      },
      onCommitFiberUnmount: () => {},
    });
  });
  await page.goto('/screen');
  await expect.poll(() => page.evaluate(() => !!window.__lightsOnMap?.getLayer('floors'))).toBe(true);
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite browser import.
    const { useGame } = await import('/src/lib/store.ts');
    const commits = Reflect.get(window, 'pointerCommits') as string[];
    useGame.setState({ phase: 'EXPLORE' });
    await new Promise(resolve => setTimeout(resolve, 300));
    commits.length = 0;
    const durations: number[] = [];
    const longtasks: number[] = [];
    const observer = new PerformanceObserver(list => list.getEntries().forEach(e => longtasks.push(e.duration)));
    observer.observe({ type: 'longtask' });
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      useGame.setState({ pointers: Object.fromEntries(['#00ccff', '#ff55bb', '#99ee66', '#ffcc55'].map((color, j) => [`probe-${j}`, { x: .2 + ((i + j) % 20) / 30, y: .5, color, at: Date.now() }])) });
      durations.push(performance.now() - start);
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    observer.disconnect();
    return { updates: durations.length, syncMax: Math.max(...durations), maxLongTask: Math.max(0, ...longtasks), commits: Object.fromEntries([...new Set(commits)].map(name => [name, commits.filter(n => n === name).length])) };
  });
  console.log(`pointer probe: ${JSON.stringify(result)}`);
  await info.attach('pointer probe', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  if (process.env.AUDIO_LAG_OUTPUT) { mkdirSync(process.env.AUDIO_LAG_OUTPUT, { recursive: true }); writeFileSync(join(process.env.AUDIO_LAG_OUTPUT, 'pointer-probe.json'), JSON.stringify(result, null, 2)); }
  if (process.env.AUDIO_LAG_ASSERT) for (const name of ['ScreenApp', 'Subtitles', 'ChallengeCards', 'IntroMedia', 'ScoreCard']) expect(result.commits[name] ?? 0, name).toBe(0);
});
