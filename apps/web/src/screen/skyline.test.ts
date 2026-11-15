import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import { cleanRing, displayFloors, facadeBands, floorHalos, floorReveals, glass, mapColors, recede, roofCaps, smoothFlight, stickyHit } from "./skyline";

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

// A 40 m x 30 m rectangle near Houston, turned 20 degrees, in lng/lat.
const MX = 111320 * Math.cos(29.76 * Math.PI / 180), MY = 110540;
const turn = (x: number, y: number): [number, number] => { const a = 20 * Math.PI / 180; return [-95.36 + (x * Math.cos(a) - y * Math.sin(a)) / MX, 29.76 + (x * Math.sin(a) + y * Math.cos(a)) / MY]; };
const metres = (ring: number[][]) => ring.map(p => [(p[0]! + 95.36) * MX, (p[1]! - 29.76) * MY] as [number, number]);
const area = (ring: number[][]) => { const m = metres(ring); return Math.abs(m.reduce((sum, p, i) => { const q = m[(i + 1) % m.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2); };

describe("hero display geometry", () => {
  it("redraws a wobbly right-angled survey outline as four crisp corners of the same extent", () => {
    const noisy: number[][] = [];
    const wobble = (i: number) => (i % 2 ? 0.3 : -0.3);
    for (let i = 0; i < 20; i++) noisy.push(turn(i * 2, wobble(i)));
    for (let i = 0; i < 15; i++) noisy.push(turn(40 + wobble(i), i * 2));
    for (let i = 0; i < 20; i++) noisy.push(turn(40 - i * 2, 30 + wobble(i)));
    for (let i = 0; i < 15; i++) noisy.push(turn(wobble(i), 30 - i * 2));
    noisy.push(noisy[0]!);
    const clean = cleanRing(noisy);
    expect(clean).toHaveLength(5);
    expect(clean[0]).toEqual(clean[4]);
    expect(area(clean.slice(0, -1)) / 1200).toBeGreaterThan(0.95);
    expect(area(clean.slice(0, -1)) / 1200).toBeLessThan(1.1);
    // Every corner is a right angle.
    const m = metres(clean.slice(0, -1));
    m.forEach((p, i) => { const a = m[(i + 3) % 4]!, b = m[(i + 1) % 4]!; expect(Math.abs((a[0] - p[0]) * (b[0] - p[0]) + (a[1] - p[1]) * (b[1] - p[1]))).toBeLessThan(1); });
  });
  it("keeps a shape that is not right-angled, and leaves tiny rings alone", () => {
    const triangle = [turn(0, 0), turn(40, 0), turn(10, 35), turn(0, 0)];
    const clean = cleanRing(triangle);
    expect(clean).toHaveLength(4);
    expect(area(clean.slice(0, -1)) / area(triangle.slice(0, -1))).toBeCloseTo(1, 2);
    const line = [[0, 0], [1, 1], [0, 0]];
    expect(cleanRing(line)).toBe(line);
  });
  it("cleans the footprint without touching any floor fact", () => {
    const before = JSON.stringify(floors);
    const display = displayFloors(floors);
    expect(display.features).toHaveLength(1);
    expect(display.features[0]!.properties).toEqual(floors.features[0]!.properties);
    expect(display.features[0]!.geometry.type).toBe("Polygon");
    expect(JSON.stringify(floors)).toBe(before);
  });
  it("draws a thin reveal under upper floors only, and caps the top floor with a deck and crown", () => {
    const square = floors.features[0]!.geometry;
    const stack: FeatureCollection = { type: "FeatureCollection", features: [1, 2, 3].map(n => ({ type: "Feature" as const, properties: { building_id: "test", floor_number: n, source_status: "dark", base_m: (n - 1) * 4, height_m: n * 4 }, geometry: square })) };
    const reveals = floorReveals(stack).features;
    expect(reveals.map(f => f.properties?.floor_number)).toEqual([2, 3]);
    for (const f of reveals) expect(f.properties!.height_m - f.properties!.base_m).toBeLessThan(0.31);
    const caps = roofCaps(stack).features;
    expect(caps.map(f => f.properties?.part).sort()).toEqual(["crown", "deck"]);
    for (const f of caps) { expect(f.properties?.base_m).toBe(12); expect(f.properties?.height_m).toBeGreaterThan(12); expect(Object.keys(f.properties!).sort()).toEqual(["base_m", "building_id", "height_m", "part"]); }
    expect(roofCaps({ type: "FeatureCollection", features: [] }).features).toEqual([]);
  });
  it("recolours only colour literals, with brighter glass on lit floors and darker receded towers", () => {
    const expression = ["match", ["get", "source_status"], "dark", "#1a1d2b", "#f2c46d"];
    const mapped = mapColors(expression, () => "#000000");
    expect(mapped).toEqual(["match", ["get", "source_status"], "dark", "#000000", "#000000"]);
    expect(expression[3]).toBe("#1a1d2b");
    const sum = (c: string) => [1, 3, 5].reduce((s, i) => s + parseInt(c.slice(i, i + 2), 16), 0);
    expect(sum(glass("#f2c46d"))).toBeGreaterThan(sum("#f2c46d"));
    expect(sum(glass("#1a1d2b"))).toBeGreaterThan(sum("#1a1d2b"));
    expect(sum(recede("#f2c46d"))).toBeLessThan(sum("#f2c46d") / 2);
  });
});
