import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import type { FeatureCollection } from 'geojson';
import type { ExpressionSpecification } from 'maplibre-gl';

// Evaluate the actual map paint using MapLibre's own expression engine.
const require = createRequire(import.meta.url);
const { createExpression } = createRequire(require.resolve('maplibre-gl/package.json'))('@maplibre/maplibre-gl-style-spec') as {
  createExpression: (paint: ExpressionSpecification, root: string) => {
    result: string;
    value: { evaluate: (globals: { zoom: number }, feature: { type: string; properties: Record<string, unknown> }) => unknown };
  };
};

test('real partial and unknown floors retain their PRD colors', async ({ page, request }) => {
  await page.goto('/screen');
  await expect.poll(() => page.evaluate(() => Boolean(window.__lightsOnMap?.getLayer('floors')))).toBe(true);
  const paint = await page.evaluate(() => window.__lightsOnMap!.getPaintProperty('floors', 'fill-extrusion-color')) as ExpressionSpecification;
  const expression = createExpression(paint, 'layers[0].paint.fill-extrusion-color');
  expect(expression.result).toBe('success');
  const response = await request.get('/floors.geojson');
  const floors = await response.json() as FeatureCollection;
  const partial = floors.features.find((f) => f.properties?.source_status === 'partial');
  const unknown = floors.features.find((f) => f.properties?.source_status === 'unknown');
  expect(partial).toBeTruthy();
  expect(unknown).toBeTruthy();
  // Known Phase 2 integration bug: generated game_status=lit overrides both.
  test.fail(true, 'Real partial/unknown floors are currently painted warm gold');
  expect.soft(expression.value.evaluate({ zoom: 15.5 }, { type: 'Polygon', properties: partial!.properties! })).toBe('#4a4636');
  expect.soft(expression.value.evaluate({ zoom: 15.5 }, { type: 'Polygon', properties: unknown!.properties! })).toBe('#3a3f52');
});
