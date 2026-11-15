import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import { facadeBands, floorHalos, smoothFlight, stickyHit } from "./skyline";

const floors: FeatureCollection = { type: "FeatureCollection", features: [{ type: "Feature", properties: { building_id: "test", floor_number: 6, source_status: "dark", base_m: 20, height_m: 24 }, geometry: { type: "Polygon", coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]] } }] };

describe("skyline presentation", () => {
  it("adds separated facade bands without changing source facts or touching the roof", () => {
    const before = JSON.stringify(floors);
    const bands = facadeBands(floors);
    expect(bands.features[0]?.geometry.type).toBe("MultiPolygon");
    const geometry = bands.features[0]!.geometry;
    expect(geometry.type === "MultiPolygon" && geometry.coordinates.length).toBeGreaterThan(4);
    for (const feature of bands.features) {
      expect(feature.properties?.building_id).toBe("test");
      expect(feature.properties?.source_status).toBe("dark");
      expect(feature.properties?.base_m).toBeGreaterThan(20);
      expect(feature.properties?.height_m).toBeLessThan(24);
    }
    expect(JSON.stringify(floors)).toBe(before);
    expect(facadeBands({ type: "FeatureCollection", features: [] }).features).toEqual([]);
  });
  it("holds a boundary miss briefly but switches immediately to a real hit", () => {
    const old = { building: "one", floor: 6, seen: 100 };
    expect(stickyHit(old, null, 200)).toEqual(old);
    expect(stickyHit(old, null, 221)).toBeNull();
    expect(stickyHit(old, { building: "two", floor: 7 }, 110)).toEqual({ building: "two", floor: 7, seen: 110 });
  });
  it("eases both ends of a flight and preserves the midpoint and duration", () => {
    expect(smoothFlight(0)).toBe(0);
    expect(smoothFlight(0.5)).toBe(0.5);
    expect(smoothFlight(1)).toBe(1);
    expect(smoothFlight(0.01)).toBeLessThan(0.001);
    expect(smoothFlight(0.99)).toBeGreaterThan(0.999);
  });
  it("wraps each floor in a wider glow shell at the same height, keeping its status", () => {
    const halo = floorHalos(floors).features[0]!;
    expect(halo.properties).toEqual(floors.features[0]!.properties);
    const ring = halo.geometry.type === "MultiPolygon" ? halo.geometry.coordinates[0]![0]! : [];
    expect(Math.min(...ring.map(p => p[0]!))).toBeLessThan(0);
    expect(Math.max(...ring.map(p => p[0]!))).toBeGreaterThan(0.001);
  });
});
