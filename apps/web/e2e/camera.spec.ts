import { expect, test } from "@playwright/test";
import type { FeatureCollection } from "geojson";

for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 720]]) {
  test(`every building fits after wake at ${width}`, async ({ browser, baseURL, request }) => {
    test.setTimeout(240_000);
    const buildings = await (await request.get('/api/buildings')).json() as { id: string; name: string }[];
    const floors = await (await request.get('/floors.geojson')).json() as FeatureCollection;
    for (const building of buildings.sort((a, b) => Number(b.id === "233953") - Number(a.id === "233953"))) {
      const context = await browser.newContext({ viewport: { width: width!, height: height! } });
      try {
        const screen = await context.newPage();
        await screen.goto(`${baseURL}/screen`);
        const join = screen.locator('aside p').filter({ hasText: '/play?room=' });
        await expect(join).toBeVisible();
        const admin = await context.newPage();
        await admin.goto(`${baseURL}/admin`);
        await admin.getByLabel('Host PIN').fill('1234');
        await admin.getByRole('button', { name: 'Data: kit', exact: true }).click();
        const phone = await context.newPage();
        await phone.goto((await join.innerText()).trim());
        await phone.getByLabel('Nickname').fill('Camera');
        await phone.getByRole('button', { name: 'Join', exact: true }).click();
        await admin.getByRole('button', { name: 'Skip phase', exact: true }).click();
        await phone.getByRole('button', { name: `Wake building ${building.name}`, exact: true }).click();
        await expect(screen.getByTestId('building-label')).toHaveText(`Waking ${building.name}`);
        await screen.waitForTimeout(2200);
        await expect.poll(() => screen.evaluate(() => !window.__lightsOnMap!.isMoving())).toBe(true);
        const bounds = await screen.evaluate(({ floors, id }) => {
          const map = window.__lightsOnMap!;
          const matrix = map._camera.transform.getProjectionDataForCustomLayer().mainMatrix;
          const { clientWidth: w, clientHeight: h } = map.getCanvas();
          const projected: number[][] = [];
          for (const f of floors.features.filter(f => String(f.properties?.building_id) === id)) {
            const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
            for (const polygon of polygons) for (const p of polygon[0] ?? []) for (const z of [0, Number(f.properties?.height_m)]) {
              const lat = p[1]! * Math.PI / 180;
              const v = [(p[0]! + 180) / 360, (180 - 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat / 2))) / 360, z / (40075016.68557849 * Math.cos(lat)), 1];
              const out = [0, 1, 2, 3].map(row => v.reduce((s, n, col) => s + n * matrix[col * 4 + row]!, 0));
              projected.push([(out[0]! / out[3]! + 1) * w / 2, (1 - out[1]! / out[3]!) * h / 2, out[3]!]);
            }
          }
          return { w, h, points: projected };
        }, { floors, id: String(building.id) });
        await screen.getByTestId('field').screenshot({ path: `e2e/screenshots/camera/${building.id}-${width}.png` });
        expect(bounds.points.length).toBeGreaterThan(0);
        for (const [x, y, depth] of bounds.points) {
          expect(depth).toBeGreaterThan(0);
          expect(x).toBeGreaterThan(20);
          expect(x).toBeLessThan(bounds.w - 20);
          expect(y).toBeGreaterThan(20);
          expect(y).toBeLessThan(bounds.h - 20);
        }
      } finally { await context.close(); }
    }
  });
}
