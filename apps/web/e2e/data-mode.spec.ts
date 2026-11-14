import { expect, test as base, type Browser } from '@playwright/test';

type Mode = 'kit' | 'fixtures';

// The data mode is process-wide, so other specs (or a previous --repeat-each
// iteration) may leave it anywhere. Set it over the host socket, outside the UI.
async function setDataMode(browser: Browser, baseURL: string, mode: Mode): Promise<void> {
  const context = await browser.newContext();
  try {
    const { room } = await (await context.request.post(`${baseURL}/api/rooms`, { data: { base_url: baseURL } })).json() as { room: string };
    const page = await context.newPage();
    await page.goto(`${baseURL}/api/health`);
    await page.evaluate(({ room, mode }) => new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/ws/${room}?role=admin`);
      let sent = false;
      const timer = setTimeout(() => reject(new Error('data mode reset timed out')), 10_000);
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as { type: string; data_mode?: string; code?: string };
        if (msg.type === 'error') { clearTimeout(timer); reject(new Error(msg.code)); }
        if (!sent && msg.type === 'room_state') {
          sent = true;
          ws.send(JSON.stringify({ type: 'host_action', pin: '1234', action: 'set_data_mode', data_mode: mode }));
        } else if (sent && msg.type === 'room_state' && msg.data_mode === mode) {
          clearTimeout(timer); ws.close(); resolve();
        }
      };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('host socket failed')); };
    }), { room, mode });
    const health = await (await context.request.get(`${baseURL}/api/health`)).json() as { data_mode: string };
    expect(health.data_mode).toBe(mode);
  } finally { await context.close(); }
}

// Every test starts in kit mode and restores whatever mode it found.
const test = base.extend<{ knownDataMode: Mode }>({
  knownDataMode: [async ({ browser, baseURL, request }, use) => {
    const before = (await (await request.get('/api/health')).json() as { data_mode: Mode }).data_mode;
    await setDataMode(browser, baseURL!, 'kit');
    await use('kit');
    await setDataMode(browser, baseURL!, before);
  }, { auto: true }],
});

test('host switch changes the process provider and refreshes skyline facts', async ({ page, request, baseURL, knownDataMode }) => {
  expect(knownDataMode).toBe('kit');
  const response = await request.post('/api/rooms', { data: { base_url: baseURL } });
  const { room } = await response.json() as { room: string };
  await page.addInitScript((code) => localStorage.setItem('lo.room', code), room);
  await page.goto('/admin');
  await expect(page.getByText(/· open ·/)).toBeVisible();
  await page.getByLabel('Host PIN').fill('1234');
  const screen = await page.context().newPage();
  await screen.goto('/screen');
  await expect(screen.getByTestId('field')).toHaveAttribute('data-facts-ready', 'true');
  let lists = 0;
  const modes: string[] = [];
  screen.on('response', async (r) => {
    if (new URL(r.url()).pathname === '/api/buildings') lists++;
    if (/\/api\/buildings\/[^/]+$/.test(new URL(r.url()).pathname)) {
      modes.push((await r.json() as { data_mode: string }).data_mode);
    }
  });
  try {
    // Each iteration is a real transition away from the known starting mode.
    for (const mode of ['fixtures', 'kit'] as const) {
      lists = 0; modes.length = 0;
      await page.getByRole('button', { name: `Data: ${mode}`, exact: true }).click();
      await expect(page.getByText(new RegExp(`data mode: ${mode} \\(all rooms\\)`))).toBeVisible();
      const dossier = await request.get('/api/buildings/233953');
      expect(dossier.status()).toBe(200);
      expect((await dossier.json() as { data_mode: string }).data_mode).toBe(mode);
      await expect.poll(() => modes.length).toBe(7);
      expect(modes.every((m) => m === mode)).toBe(true);
      expect(lists).toBe(1);
      await expect(screen.getByTestId('field')).toHaveAttribute('data-facts-ready', 'true');
    }
  } finally { await screen.close(); }
});
