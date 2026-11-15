import { expect, test, type Page } from "@playwright/test";
import type { FeatureCollection } from "geojson";

async function assertFramed(screen: Page, floors: FeatureCollection, id?: string) {
const bounds = await screen.evaluate(({ floors, id }) => {
  const map = window.__lightsOnMap!;
  const matrix = map._camera.transform.getProjectionDataForCustomLayer().mainMatrix;
  const { clientWidth: w, clientHeight: h } = map.getCanvas();
  const projected: number[][] = [];
  for (const f of floors.features.filter(f => id === undefined || String(f.properties?.building_id) === id)) {
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const polygon of polygons) for (const p of polygon[0] ?? []) for (const z of [0, Number(f.properties?.height_m)]) {
      const lat = p[1]! * Math.PI / 180;
      const v = [(p[0]! + 180) / 360, (180 - 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat / 2))) / 360, z / (40075016.68557849 * Math.cos(lat)), 1];
      const out = [0, 1, 2, 3].map(row => v.reduce((s, n, col) => s + n * matrix[col * 4 + row]!, 0));
      projected.push([(out[0]! / out[3]! + 1) * w / 2, (1 - out[1]! / out[3]!) * h / 2, out[3]!]);
    }
  }
  return { w, h, points: projected };
}, { floors, id });

expect(bounds.points.length).toBeGreaterThan(0);
expect(Math.min(...bounds.points.map(p => p[2]!))).toBeGreaterThan(0);
expect(Math.min(...bounds.points.map(p => p[0]!))).toBeGreaterThan(20);
expect(Math.max(...bounds.points.map(p => p[0]!))).toBeLessThan(bounds.w - 20);
expect(Math.min(...bounds.points.map(p => p[1]!))).toBeGreaterThan(20);
expect(Math.max(...bounds.points.map(p => p[1]!))).toBeLessThan(bounds.h - 20);
}

for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 720]]) {
  test(`every building fits after wake at ${width}`, async ({ browser, baseURL, request }) => {
    test.setTimeout(300_000);
    const buildings = await (await request.get('/api/buildings')).json() as { id: string; name: string }[];
    expect((await (await request.get('/api/health')).json()).demo_mode).toBe(false);
    const floors = await (await request.get('/floors.geojson')).json() as FeatureCollection;
    const city = await (await request.get('/city.geojson')).json() as FeatureCollection;
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
        await expect(screen.getByTestId('phase')).toContainText('EXPLORE');
        await expect(screen.getByTestId('field')).toHaveAttribute('data-facts-ready', 'true');
        if (building.id === '233953') {
          await screen.waitForTimeout(2700);
          await assertFramed(screen, { type: 'FeatureCollection', features: [...floors.features, ...city.features] });
          await screen.getByTestId('field').screenshot({ path: `e2e/screenshots/camera/overview-${width}.png` });
        }
        if (building.id === '233899') {
          // This hero's persona is being prepared separately; exercise the exact production dive.
          await screen.evaluate(id => window.__lightsOnFrameBuilding!(id), building.id);
        } else {
          await phone.getByRole('button', { name: `Wake building ${building.name}`, exact: true }).click();
          await expect(screen.getByTestId('building-label')).toHaveText(`Waking ${building.name}`);
        }
        await screen.waitForTimeout(2200);
        await expect.poll(() => screen.evaluate(() => !window.__lightsOnMap!.isMoving())).toBe(true);
        await assertFramed(screen, floors, String(building.id));
        // Highlight only the target to measure actual WebGL pixels, including base and roof.
        await screen.evaluate(id => {
          const map = window.__lightsOnMap!;
          map.setPaintProperty('floors', 'fill-extrusion-color', ['case', ['==', ['get', 'building_id'], id], '#00ffff', '#252e40']);
        }, String(building.id));
        const settle = () => screen.evaluate(() => new Promise<void>(resolve => {
          const map = window.__lightsOnMap!; map.once('idle', () => resolve()); map.triggerRepaint();
        }));
        await settle();
        const field = screen.getByTestId('field');
        const actual = await field.screenshot({ path: `e2e/screenshots/camera/${building.id}-${width}.png` });
        await screen.evaluate(id => {
          const map = window.__lightsOnMap!;
          map.setLayoutProperty('context', 'visibility', 'none');
          map.setLayoutProperty('context-faded', 'visibility', 'none');
          map.setFilter('floors', ['==', ['get', 'building_id'], id]);
        }, String(building.id));
        await settle();
        const clear = await field.screenshot();
        const pixels = await screen.evaluate(async ({ actual, clear }) => {
          const read = async (data: string) => {
            const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0);
            return { data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width };
          };
          const a = await read(actual), c = await read(clear);
          const cyan = (p: Uint8ClampedArray, i: number) => p[i + 1]! > 80 && p[i + 2]! > 80 && p[i + 1]! - p[i]! > 50 && p[i + 2]! - p[i]! > 50;
          let top = Infinity, bottom = 0;
          for (let i = 0; i < c.data.length; i += 4) if (cyan(c.data, i)) {
            const y = Math.floor(i / 4 / c.width); top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
          const seen = [0, 0, 0], expected = [0, 0, 0];
          for (let i = 0; i < c.data.length; i += 4) {
            const y = Math.floor(i / 4 / c.width);
            const band = Math.max(0, Math.min(2, Math.floor((y - top) / Math.max(1, bottom - top + 1) * 3)));
            if (cyan(c.data, i)) expected[band]!++;
            if (cyan(a.data, i)) seen[band]!++;
          }
          return { seen, expected };
        }, { actual: actual.toString('base64'), clear: clear.toString('base64') });
        console.log(`${building.id}-${width} visible/clear pixels by roof, middle, base:`, pixels);
        for (let band = 0; band < 3; band++) {
          expect(pixels.expected[band]).toBeGreaterThan(100);
          expect(pixels.seen[band]! / pixels.expected[band]!).toBeGreaterThan(0.8);
        }
      } finally { await context.close(); }
    }
  });
}
