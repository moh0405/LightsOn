import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import { footprint, occluders, planCamera, targetHeight } from "./camera";

describe("round camera", () => {
  it("keeps north when nothing blocks the view", () => {
    expect(planCamera([], 20)).toEqual({ bearing: 0, faded: [] });
  });
  it("turns away from a tall tower on the camera side and fades only real blockers", () => {
    // Camera at bearing 0 sits south (azimuth 180) of the target.
    const tower = { index: 1, distance: 40, azimuth: 180, height: 120 };
    const low = { index: 2, distance: 60, azimuth: 0, height: 10 };
    const plan = planCamera([tower, low], 20);
    expect(plan.bearing).not.toBe(0);
    expect(plan.faded).not.toContain(2);
  });
  it("fades a blocker when every side is blocked", () => {
    const ring = Array.from({ length: 36 }, (_, i) => ({ index: i, distance: 40, azimuth: i * 10, height: 150 }));
    const plan = planCamera(ring, 20);
    expect(plan.faded.length).toBeGreaterThan(0);
  });
  it("gives Esperson an open, unblocked camera side in the real city", () => {
    const city = JSON.parse(readFileSync("public/city.geojson", "utf8")) as FeatureCollection;
    const floors = JSON.parse(readFileSync("public/floors.geojson", "utf8")) as FeatureCollection;
    const target = targetHeight(floors, "233953");
    expect(target).toBeGreaterThan(0);
    const shape = footprint(floors, "233953");
    expect(shape).not.toBeNull();
    const near = occluders(city, shape!.center[0], shape!.center[1]);
    const plan = planCamera(near, target, 60, shape!.radius);
    expect(plan.bearing).not.toBe(0);
  });
});
