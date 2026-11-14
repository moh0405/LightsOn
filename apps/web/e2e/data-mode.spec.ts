import { expect, test } from '@playwright/test';

test('host fixture switch changes the building provider', async ({ page, request, baseURL }) => {
  // Known Phase 2 bug: set_data_mode updates Room.data_mode, while the HTTP
  // provider reads only DATA_MODE. Remove test.fail when provider routing is fixed.
  const response = await request.post('/api/rooms', { data: { base_url: baseURL } });
  const { room } = await response.json() as { room: string };
  await page.addInitScript((code) => localStorage.setItem('lo.room', code), room);
  await page.goto('/admin');
  await expect(page.getByText(/· open ·/)).toBeVisible();
  await page.getByLabel('Host PIN').fill('1234');
  await page.getByRole('button', { name: 'Data: fixtures', exact: true }).click();
  await expect(page.getByText(/data mode: fixtures/)).toBeVisible();
  const dossier = await request.get('/api/buildings/233953');
  expect(dossier.status()).toBe(200);
  test.fail(true, 'Host switch currently updates the label but leaves the kit provider active');
  expect((await dossier.json() as { data_mode: string }).data_mode).toBe('fixtures');
});
