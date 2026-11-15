import { expect, type Page } from "@playwright/test";
import type { FeatureCollection } from "geojson";

export async function assertFramed(screen: Page, floors: FeatureCollection, id?: string) {
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
  return { top: Math.min(...bounds.points.map(p => p[1]!)), bottom: Math.max(...bounds.points.map(p => p[1]!)) };
}
