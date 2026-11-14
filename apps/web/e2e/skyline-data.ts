import type { BrowserContext } from "@playwright/test";

// Verified dossier values only. Squares and extrusion spacing below are synthetic
// rendering geometry, not claims about footprint dimensions or measured heights.
export const buildings = [
  { id: "233953", name: "Esperson", lat: 29.7588018, lng: -95.3650891, stories: 27, is_hero: true, dark_floors: 3, dark_sqft: 94509 },
  { id: "233899", name: "Wells Fargo Plaza", lat: 29.7584604, lng: -95.3682126, stories: 71, is_hero: true, dark_floors: 0, dark_sqft: null },
];
export const floors = { type: "FeatureCollection", features: buildings.flatMap((b) => Array.from({ length: b.stories }, (_, i) => ({
  type: "Feature", geometry: { type: "Polygon", coordinates: [[
    [b.lng - 0.00015, b.lat - 0.00015], [b.lng + 0.00015, b.lat - 0.00015],
    [b.lng + 0.00015, b.lat + 0.00015], [b.lng - 0.00015, b.lat + 0.00015], [b.lng - 0.00015, b.lat - 0.00015],
  ]] }, properties: { building_id: b.id, building_name: b.name, floor_number: i + 1, floor_id: null,
    base_m: i * 4, height_m: (i + 1) * 4, source_status: b.id === "233953" && [6, 7, 8].includes(i + 1) ? "dark" : "unknown", game_status: "dark", is_hero: true },
}))) };
export async function mockSkyline(context: BrowserContext) {
  await context.route("**/floors.geojson", (r) => r.fulfill({ json: floors }));
  await context.route("**/city.geojson", (r) => r.fulfill({ json: { type: "FeatureCollection", features: [] } }));
  await context.route("**/api/buildings", (r) => r.fulfill({ json: buildings }));
  await context.route(/\/api\/buildings\/[^/?]+$/, (r) => {
    const b = buildings.find((b) => r.request().url().endsWith(`/${b.id}`));
    return r.fulfill({ json: b ? { ...b, address: null, floors: Array.from({ length: b.stories }, (_, i) => {
      const dark = b.id === "233953" && [6, 7, 8].includes(i + 1);
      return { number: i + 1, size_sqft: dark ? 31503 : null, available_sqft: dark ? 31503 : null, occupied_sqft: null, source_status: dark ? "dark" : "unknown", game_status: "dark" };
    }), facts: [], tenant_history: null, media: null, data_mode: "fixtures" } : null });
  });
}
