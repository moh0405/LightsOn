import type { FeatureCollection, Feature, Position, Polygon, LineString } from "geojson";

// All dimensions here are decorative facade treatments, never building facts.
export function facadeBands(floors: FeatureCollection): FeatureCollection {
  return { type: "FeatureCollection", features: floors.features.flatMap(feature => {
    const base = Number(feature.properties?.base_m), top = Number(feature.properties?.height_m);
    if (!Number.isFinite(base) || !Number.isFinite(top) || top <= base) return [];
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates]
      : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [];
    const windows: Position[][][] = [];
    for (const polygon of polygons) {
      const ring = polygon[0] ?? [];
      const area = ring.slice(1).reduce((sum, b, i) => sum + ring[i]![0]! * b[1]! - b[0]! * ring[i]![1]!, 0);
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]!, b = ring[i]!;
        const mx = 111320 * Math.cos(a[1]! * Math.PI / 180), my = 110540;
        const dx = (b[0]! - a[0]!) * mx, dy = (b[1]! - a[1]!) * my, length = Math.hypot(dx, dy);
        if (length < 0.5) continue;
        const count = Math.max(1, Math.min(24, Math.ceil(length / 5)));
        const sign = area >= 0 ? 1 : -1;
        const nx = sign * dy / length / mx, ny = -sign * dx / length / my;
        const point = (t: number, offset: number): Position => [a[0]! + (b[0]! - a[0]!) * t + nx * offset, a[1]! + (b[1]! - a[1]!) * t + ny * offset];
        for (let n = 0; n < count; n++) {
          const lo = (n + 0.13) / count, hi = (n + 0.87) / count;
          windows.push([[point(lo, 0.12), point(hi, 0.12), point(hi, 0.23), point(lo, 0.23), point(lo, 0.12)]]);
        }
      }
    }
    const gap = Math.min(0.65, (top - base) * 0.22);
    return windows.length ? [{ type: "Feature" as const, properties: { ...feature.properties, base_m: base + gap, height_m: top - gap }, geometry: { type: "MultiPolygon" as const, coordinates: windows } }] : [];
  }) };
}

/** A slightly wider shell per floor. Drawn translucent in the 3D pass it reads as a soft,
 * depth-correct bloom around lit floors (a 2D overlay would shine through nearer towers). */
export function floorHalos(floors: FeatureCollection, scale = 1.07): FeatureCollection {
  return { type: "FeatureCollection", features: floors.features.flatMap(feature => {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates]
      : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [];
    const coordinates = polygons.flatMap(polygon => {
      const ring = polygon[0]; if (!ring || ring.length < 4) return [];
      const n = ring.length - 1;
      const cx = ring.slice(0, n).reduce((sum, p) => sum + p[0]!, 0) / n, cy = ring.slice(0, n).reduce((sum, p) => sum + p[1]!, 0) / n;
      return [[ring.map(p => [cx + (p[0]! - cx) * scale, cy + (p[1]! - cy) * scale])]];
    });
    return coordinates.length ? [{ type: "Feature" as const, properties: { ...feature.properties }, geometry: { type: "MultiPolygon" as const, coordinates } }] : [];
  }) };
}

/** A slim architectural cornice; generated only from the supplied footprint and roof. */
export function roofEdges(city: FeatureCollection): FeatureCollection {
  const features: Feature<Polygon>[] = [];
  for (const feature of city.features) {
    const top = Number(feature.properties?.height_m);
    if (!Number.isFinite(top)) continue;
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates]
      : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [];
    for (const polygon of polygons) {
      const ring = polygon[0]; if (!ring || ring.length < 4) continue;
      const center = ring.slice(0, -1).reduce((p, c) => [p[0]! + c[0]! / (ring.length - 1), p[1]! + c[1]! / (ring.length - 1)], [0, 0]);
      const scaled = (s: number) => ring.map(p => [center[0]! + (p[0]! - center[0]!) * s, center[1]! + (p[1]! - center[1]!) * s]);
      features.push({ type: "Feature", properties: { ...feature.properties, base_m: top + 0.08, height_m: top + 0.3 }, geometry: { type: "Polygon", coordinates: [scaled(1.003), scaled(0.975).reverse()] } });
    }
  }
  return { type: "FeatureCollection", features };
}

/** A decorative ground grid, not a street dataset or a claim about real roads. */
export function groundGrid(city: FeatureCollection): FeatureCollection<LineString> {
  const positions = city.features.flatMap(f => f.geometry.type === "Polygon" ? f.geometry.coordinates[0] ?? [] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.flatMap(p => p[0] ?? []) : []);
  if (!positions.length) return { type: "FeatureCollection", features: [] };
  const xs = positions.map(p => p[0]!), ys = positions.map(p => p[1]!);
  const west = Math.min(...xs) - 0.001, east = Math.max(...xs) + 0.001, south = Math.min(...ys) - 0.001, north = Math.max(...ys) + 0.001;
  const features: Feature<LineString>[] = [];
  for (let i = 0; i <= 24; i++) {
    const x = west + (east - west) * i / 24, y = south + (north - south) * i / 24;
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[west, y], [east, y]] } }, { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[x, south], [x, north]] } });
  }
  return { type: "FeatureCollection", features };
}

export const smoothFlight = (t: number) => t * t * (3 - 2 * t);
export interface Hit { building: string; floor: number | null; seen: number }
export function stickyHit(previous: Hit | null, hit: Omit<Hit, "seen"> | null, now: number): Hit | null {
  return hit ? { ...hit, seen: now } : previous && now - previous.seen <= 120 ? previous : null;
}
