import { expect, test } from '@playwright/test';

test('host switch changes the process provider and refreshes skyline facts', async ({ page, request, baseURL }) => {
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
    for (const mode of ['fixtures', 'kit']) {
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
