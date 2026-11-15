import type { FeatureCollection, Feature, Position, Polygon, LineString } from "geojson";

// Everything here is display geometry and decorative facade treatment, never building facts:
// floor count, base, height and status always come straight from the supplied features.
type P = [number, number];
const MY = 110540;
const mxAt = (lat: number) => 111320 * Math.cos(lat * Math.PI / 180);
const signedArea = (r: P[]) => r.reduce((sum, p, i) => { const q = r[(i + 1) % r.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const outerRings = (feature: Feature): Position[][] => feature.geometry.type === "Polygon" ? [feature.geometry.coordinates[0] ?? []]
  : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates.map(p => p[0] ?? []) : [];
/** An open ring in local metres plus the way back to lng/lat. */
function local(ring: Position[]): { points: P[]; back: (p: P) => Position } {
  const open = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? ring.slice(0, -1) : ring;
  const ox = open.reduce((s, p) => s + p[0]!, 0) / Math.max(1, open.length), oy = open.reduce((s, p) => s + p[1]!, 0) / Math.max(1, open.length);
  const mx = mxAt(oy);
  return { points: open.map(p => [(p[0]! - ox) * mx, (p[1]! - oy) * MY]), back: p => [ox + p[0] / mx, oy + p[1] / MY] };
}
const close = (points: P[], back: (p: P) => Position): Position[] => { const r = points.map(back); return [...r, r[0]!]; };

/** Douglas-Peucker on a closed ring, anchored at an extreme vertex. */
function simplify(points: P[], tolerance: number): P[] {
  if (points.length < 5) return points;
  const start = points.reduce((best, p, i) => p[0] > points[best]![0] ? i : best, 0);
  const line = [...points.slice(start), ...points.slice(0, start), points[start]!];
  const far = line.reduce((best, p, i) => Math.hypot(p[0] - line[0]![0], p[1] - line[0]![1]) > Math.hypot(line[best]![0] - line[0]![0], line[best]![1] - line[0]![1]) ? i : best, 0);
  const keep = new Set([0, far, line.length - 1]);
  const walk = (a: number, b: number) => {
    const [ax, ay] = line[a]!, [bx, by] = line[b]!, length = Math.hypot(bx - ax, by - ay) || 1;
    let worst = -1, distance = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (line[i]![1] - ay) - (by - ay) * (line[i]![0] - ax)) / length;
      if (d > distance) { distance = d; worst = i; }
    }
    if (worst > 0) { keep.add(worst); walk(a, worst); walk(worst, b); }
  };
  walk(0, far); walk(far, line.length - 1);
  return line.filter((_, i) => keep.has(i)).slice(0, -1);
}

/** Move every edge `d` metres along its outward normal (mitred corners). */
function outset(points: P[], d: number): P[] {
  const sign = signedArea(points) >= 0 ? 1 : -1, n = points.length;
  const normal = (a: P, b: P): P => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [sign * (b[1] - a[1]) / l, -sign * (b[0] - a[0]) / l]; };
  return points.map((p, i) => {
    const a = normal(points[(i + n - 1) % n]!, p), b = normal(p, points[(i + 1) % n]!);
    const k = d / Math.max(0.25, 1 + a[0] * b[0] + a[1] * b[1]);
    return [p[0] + (a[0] + b[0]) * k, p[1] + (a[1] + b[1]) * k];
  });
}

/**
 * A crisp footprint for rendering. Survey outlines carry metre-scale wobble that turns into ragged,
 * wavy facades once extruded. Right-angled buildings are redrawn on their own dominant axes, each
 * facade on the outer envelope of its points, so the drawn volume matches the surveyed extent.
 * Shapes that are not right-angled only lose their noise.
 */
export function cleanRing(ring: Position[]): Position[] {
  const { points, back } = local(ring);
  if (points.length < 4) return ring;
  const area = Math.abs(signedArea(points));
  const simple = simplify(points, 0.8);
  let sx = 0, sy = 0, total = 0;
  simple.forEach((p, i) => {
    const q = simple[(i + 1) % simple.length]!, l = Math.hypot(q[0] - p[0], q[1] - p[1]), a = Math.atan2(q[1] - p[1], q[0] - p[0]) * 4;
    sx += l * Math.cos(a); sy += l * Math.sin(a); total += l;
  });
  if (!total || Math.hypot(sx, sy) / total < 0.55) return close(simple, back);
  const theta = Math.atan2(sy, sx) / 4, cos = Math.cos(theta), sin = Math.sin(theta);
  const turned: P[] = simple.map(p => [p[0] * cos + p[1] * sin, -p[0] * sin + p[1] * cos]);
  const unturn = (p: P): P => [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos];
  const ccw = signedArea(turned) >= 0 ? 1 : -1;
  // Runs of consecutive edges facing the same way; `out` is the outward side of that facade.
  interface Run { horizontal: boolean; out: number; points: P[] }
  let runs: Run[] = [];
  turned.forEach((p, i) => {
    const q = turned[(i + 1) % turned.length]!, dx = q[0] - p[0], dy = q[1] - p[1], horizontal = Math.abs(dx) >= Math.abs(dy);
    const out = horizontal ? -ccw * Math.sign(dx) : ccw * Math.sign(dy), last = runs[runs.length - 1];
    if (last && last.horizontal === horizontal && last.out === out) last.points.push(q); else runs.push({ horizontal, out, points: [p, q] });
  });
  const span = (r: Run) => { const a = r.points[0]!, b = r.points[r.points.length - 1]!; return r.horizontal ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]); };
  const merge = () => {
    for (let i = 0; i < runs.length && runs.length > 1; i++) {
      const a = runs[i]!, b = runs[(i + 1) % runs.length]!;
      if (a !== b && a.horizontal === b.horizontal) { a.points.push(...b.points); if (a.out !== b.out) a.out = span(a) >= span(b) ? a.out : b.out; runs = runs.filter(r => r !== b); i = -1; }
    }
  };
  merge();
  // Jogs shorter than a structural bay are survey noise, not architecture worth drawing.
  for (let guard = 0; guard < 200 && runs.length > 4; guard++) {
    const short = runs.reduce((best, r) => span(r) < span(best) ? r : best, runs[0]!);
    if (span(short) >= 4) break;
    const at = runs.indexOf(short), before = runs[(at + runs.length - 1) % runs.length]!;
    before.points.push(...short.points);
    runs = runs.filter(r => r !== short);
    merge();
  }
  const fallback = () => {
    const xs = turned.map(p => p[0]), ys = turned.map(p => p[1]);
    const box: P[] = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]];
    return Math.abs(signedArea(box)) < area * 1.2 ? close(box.map(unturn), back) : close(simple, back);
  };
  if (runs.length < 4 || runs.length % 2 || runs.some((r, i) => r.horizontal === runs[(i + 1) % runs.length]!.horizontal)) return fallback();
  const level = (r: Run) => { const values = r.points.map(p => r.horizontal ? p[1] : p[0]); return r.out > 0 ? Math.max(...values) : Math.min(...values); };
  const corners: P[] = runs.map((r, i) => { const next = runs[(i + 1) % runs.length]!; return r.horizontal ? [level(next), level(r)] : [level(r), level(next)]; });
  const ratio = Math.abs(signedArea(corners)) / area;
  return ratio > 0.85 && ratio < 1.25 ? close(corners.map(unturn), back) : fallback();
}

/** The same floors (every property untouched) on the cleaned footprint. */
export function displayFloors(floors: FeatureCollection): FeatureCollection {
  const cache = new Map<string, Position[]>();
  const clean = (ring: Position[]) => { const key = JSON.stringify(ring); let out = cache.get(key); if (!out) cache.set(key, out = cleanRing(ring)); return out; };
  return { type: "FeatureCollection", features: floors.features.map(feature => {
    const g = feature.geometry;
    if (g.type === "Polygon") return { ...feature, geometry: { type: "Polygon" as const, coordinates: [clean(g.coordinates[0] ?? [])] } };
    if (g.type === "MultiPolygon") return { ...feature, geometry: { type: "MultiPolygon" as const, coordinates: g.coordinates.map(p => [clean(p[0] ?? [])]) } };
    return feature;
  }) };
}

const spans = (feature: Feature) => { const base = Number(feature.properties?.base_m), top = Number(feature.properties?.height_m); return Number.isFinite(base) && Number.isFinite(top) && top > base ? { base, top } : null; };

/** Evenly spaced glass bays standing just proud of each floor slab, with piers at the corners. */
export function facadeBands(floors: FeatureCollection): FeatureCollection {
  return { type: "FeatureCollection", features: floors.features.flatMap(feature => {
    const z = spans(feature);
    if (!z) return [];
    const windows: Position[][][] = [];
    for (const ring of outerRings(feature)) {
      const { points, back } = local(ring);
      const sign = signedArea(points) >= 0 ? 1 : -1;
      points.forEach((a, i) => {
        const b = points[(i + 1) % points.length]!, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
        if (length < 2.4) return;
        const pier = Math.min(0.7, length * 0.08), count = Math.max(1, Math.min(48, Math.round((length - 2 * pier) / 3.4))), bay = (length - 2 * pier) / count;
        const nx = sign * dy / length, ny = -sign * dx / length;
        const at = (d: number, offset: number): Position => back([a[0] + dx * d / length + nx * offset, a[1] + dy * d / length + ny * offset]);
        for (let n = 0; n < count; n++) {
          const lo = pier + (n + 0.16) * bay, hi = pier + (n + 0.84) * bay;
          windows.push([[at(lo, 0.03), at(hi, 0.03), at(hi, 0.26), at(lo, 0.26), at(lo, 0.03)]]);
        }
      });
    }
    const height = z.top - z.base;
    return windows.length ? [{ type: "Feature" as const, properties: { ...feature.properties, base_m: z.base + Math.min(0.85, height * 0.25), height_m: z.top - Math.min(0.45, height * 0.14) }, geometry: { type: "MultiPolygon" as const, coordinates: windows } }] : [];
  }) };
}

/** A thin dark shadow line where each floor meets the one below, so floors can be counted. */
export function floorReveals(floors: FeatureCollection): FeatureCollection {
  const ground = new Map<string, number>();
  for (const f of floors.features) { const z = spans(f), id = String(f.properties?.building_id); if (z) ground.set(id, Math.min(ground.get(id) ?? Infinity, z.base)); }
  return { type: "FeatureCollection", features: floors.features.flatMap(feature => {
    const z = spans(feature);
    if (!z || z.base <= (ground.get(String(feature.properties?.building_id)) ?? 0)) return [];
    const coordinates = outerRings(feature).flatMap(ring => { const { points, back } = local(ring); return points.length < 3 ? [] : [[close(outset(points, 0.34), back)]]; });
    return coordinates.length ? [{ type: "Feature" as const, properties: { ...feature.properties, height_m: z.base + Math.min(0.42, (z.top - z.base) * 0.13) }, geometry: { type: "MultiPolygon" as const, coordinates } }] : [];
  }) };
}

/** A recessed roof deck and a low crown on each tower's top floor: `part` is "deck" or "crown". */
export function roofCaps(floors: FeatureCollection): FeatureCollection {
  const tops = new Map<string, Feature>();
  for (const f of floors.features) { const z = spans(f), id = String(f.properties?.building_id), old = tops.get(id); if (z && (!old || z.top > Number(old.properties?.height_m))) tops.set(id, f); }
  const features: Feature[] = [];
  for (const feature of tops.values()) {
    const top = Number(feature.properties?.height_m);
    for (const ring of outerRings(feature)) {
      const { points, back } = local(ring);
      if (points.length < 3) continue;
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]), size = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const area = Math.abs(signedArea(points));
      const inset = (d: number) => { const r = outset(points, -d), a = signedArea(r); return Math.sign(a) === Math.sign(signedArea(points)) && Math.abs(a) < area && Math.abs(a) > area * 0.2 ? [close(r, back)] : null; };
      const deck = inset(1.3), crown = inset(Math.min(9, size * 0.16));
      const properties = { building_id: feature.properties?.building_id };
      if (deck) features.push({ type: "Feature", properties: { ...properties, part: "deck", base_m: top, height_m: top + 0.12 }, geometry: { type: "Polygon", coordinates: deck } });
      if (crown) features.push({ type: "Feature", properties: { ...properties, part: "crown", base_m: top, height_m: top + 1.1 }, geometry: { type: "Polygon", coordinates: crown } });
    }
  }
  return { type: "FeatureCollection", features };
}

/** A slightly wider shell per floor. Drawn translucent in the 3D pass, around lit floors only, it reads
 * as a soft, depth-correct bloom (a 2D overlay would shine through nearer towers). */
export function floorHalos(floors: FeatureCollection, widthM = 1.6): FeatureCollection {
  return { type: "FeatureCollection", features: floors.features.flatMap(feature => {
    const coordinates = outerRings(feature).flatMap(ring => { const { points, back } = local(ring); return points.length < 3 ? [] : [[close(outset(points, widthM), back)]]; });
    return coordinates.length ? [{ type: "Feature" as const, properties: { ...feature.properties }, geometry: { type: "MultiPolygon" as const, coordinates } }] : [];
  }) };
}

type Expression = unknown;
const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
export const mixHex = (a: string, b: string, t: number) => { const p = hex(a), q = hex(b); return `#${p.map((v, i) => Math.round(v + (q[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`; };
/** Rewrite every colour literal of a paint expression, leaving its logic alone. */
export function mapColors<T extends Expression>(expression: T, fn: (color: string) => string): T {
  if (typeof expression === "string") return (/^#[0-9a-f]{6}$/i.test(expression) ? fn(expression) : expression) as T;
  return (Array.isArray(expression) ? expression.map(e => mapColors(e, fn)) : expression) as T;
}
/** Glass for a floor colour: lit floors burn hotter than their frame, unlit floors keep a cold sheen. */
export function glass(color: string): string {
  const [r, g, b] = hex(color) as [number, number, number], bright = Math.max(r, g, b);
  if (bright >= 150) return mixHex(color, "#ffffff", 0.22);
  return r > b ? mixHex(color, "#f2c46d", 0.3) : mixHex(color, "#8ea6d2", 0.2);
}
/** Other towers step back while one building holds the stage. */
export const recede = (color: string) => mixHex(color, "#0b111c", 0.74);

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
