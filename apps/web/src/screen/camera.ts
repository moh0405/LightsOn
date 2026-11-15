import type { Feature, FeatureCollection, Position } from "geojson";

export const ROUND_PITCH = 60;
const SECTOR_DEG = 22;
const RANGE_M = 450;
const FADE_SECTOR_DEG = 35;

export interface Occluder { index: number; distance: number; azimuth: number; height: number; radius?: number }
export interface CameraPlan { bearing: number; faded: number[] }

type Point = [number, number];
const points = (positions: Position[]): Point[] => positions.map((p) => [p[0] ?? NaN, p[1] ?? NaN]);
function ring(feature: Feature): Point[] {
  const g = feature.geometry;
  if (g?.type === "Polygon") return points(g.coordinates[0] ?? []);
  if (g?.type === "MultiPolygon") return g.coordinates.flatMap((p) => points(p[0] ?? []));
  return [];
}
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Context buildings around a hero, as distance (m), azimuth from the hero (deg, 0 = north) and height. */
export function occluders(city: FeatureCollection, lng: number, lat: number): Occluder[] {
  const mx = 111320 * Math.cos((lat * Math.PI) / 180), my = 110540;
  const result: Occluder[] = [];
  city.features.forEach((f, index) => {
    const pts = ring(f), height = Number(f.properties?.height_m);
    if (!pts.length || !Number.isFinite(height)) return;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const dx = (cx - lng) * mx, dy = (cy - lat) * my, distance = Math.hypot(dx, dy);
    if (distance > RANGE_M) return;
    const radius = Math.max(...pts.map((p) => Math.hypot((p[0] - cx) * mx, (p[1] - cy) * my)));
    result.push({ index, distance, azimuth: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360, height, radius });
  });
  return result;
}

/** Half-angle, seen from the hero, inside which a building can cover part of a hero of `heroRadius`. */
const halfAngle = (o: Occluder, heroRadius: number, base: number) =>
  base + (Math.atan(Math.min(1e3, (heroRadius + (o.radius ?? 0)) / o.distance)) * 180) / Math.PI;

/** How far a building pokes above the sight line from the target height up to a camera at `pitch`. */
// Measured from the hero's near face to the blocker's near face, so wide footprints count.
const excess = (o: Occluder, targetM: number, pitch: number, heroRadius: number) =>
  o.height - (targetM + Math.max(0, o.distance - heroRadius - (o.radius ?? 0)) * Math.tan(((90 - pitch) * Math.PI) / 180));

/**
 * Pick the bearing whose camera side is most open, so lit floors at `targetM` stay in view,
 * and list the context buildings that would still block that view (to fade during the round).
 * MapLibre's bearing is where the camera looks; the camera sits on the opposite side.
 */
export function planCamera(near: Occluder[], targetM: number, pitch = ROUND_PITCH, heroRadius = 0): CameraPlan {
  let best = { bearing: 0, score: Infinity };
  for (let bearing = 0; bearing < 360; bearing += 5) {
    const side = (bearing + 180) % 360;
    const score = near.reduce((s, o) => angleDiff(o.azimuth, side) <= halfAngle(o, heroRadius, SECTOR_DEG) ? s + Math.max(0, excess(o, targetM, pitch, heroRadius)) : s, 0);
    // Ties keep the bearing nearest north, the city's default framing.
    if (score < best.score - 1e-6 || (Math.abs(score - best.score) <= 1e-6 && angleDiff(bearing, 0) < angleDiff(best.bearing, 0))) best = { bearing, score };
  }
  const side = (best.bearing + 180) % 360;
  const faded = near.filter((o) => o.distance <= heroRadius + (o.radius ?? 0) || (angleDiff(o.azimuth, side) <= halfAngle(o, heroRadius, FADE_SECTOR_DEG) && excess(o, targetM, pitch, heroRadius) > 0)).map((o) => o.index);
  return { bearing: best.bearing, faded };
}

/** The lowest floor that can light matters most: aim at the hero's lowest dark floor (then partial). */
export function targetHeight(floors: FeatureCollection, buildingId: string): number {
  const own = floors.features.filter((f) => String(f.properties?.building_id) === buildingId);
  const of = (status: string) => own.filter((f) => f.properties?.source_status === status);
  const candidates = [of("dark"), of("partial"), own].find((list) => list.length) ?? [];
  const pick = candidates.map((f) => Number(f.properties?.base_m)).filter(Number.isFinite);
  return pick.length ? Math.min(...pick) : 0;
}

/** The hero's footprint centre and radius (m) from floors.geojson; the dossier point can sit off the footprint. */
export function footprint(floors: FeatureCollection, buildingId: string): { center: Point; radius: number } | null {
  const pts = floors.features.filter((f) => String(f.properties?.building_id) === buildingId).flatMap(ring);
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const center: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const mx = 111320 * Math.cos((center[1] * Math.PI) / 180), my = 110540;
  return { center, radius: Math.max(...pts.map((p) => Math.hypot((p[0] - center[0]) * mx, (p[1] - center[1]) * my))) };
}

export interface FrameVolume { center: Point; radius: number; top: number }
export interface FramedCamera { center: Point; zoom: number; pitch: number; bearing: number }

/** A conservative cylinder enclosing the exported footprint and every roof. No story-height guesses. */
export function frameVolume(collections: FeatureCollection[], buildingId?: string): FrameVolume | null {
  const features = collections.flatMap(c => c.features).filter(f => buildingId === undefined || String(f.properties?.building_id) === buildingId);
  const pts = features.flatMap(ring).filter(p => p.every(Number.isFinite));
  if (!pts.length) return null;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const [x, y] of pts) { west = Math.min(west, x); east = Math.max(east, x); south = Math.min(south, y); north = Math.max(north, y); }
  const center: Point = [(west + east) / 2, (south + north) / 2];
  const meters = 40075016.68557849 * Math.cos(center[1] * Math.PI / 180);
  const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2;
  let radius = 0, top = 0;
  for (const p of pts) radius = Math.max(radius, Math.hypot((p[0] - center[0]) / 360, mercY(p[1]) - mercY(center[1])) * meters);
  for (const f of features) { const height = Number(f.properties?.height_m); if (Number.isFinite(height)) top = Math.max(top, height); }
  return { center, radius, top };
}

/**
 * Fit the entire 3D volume, not its ground bounds. At pitch p, a vertex (x,y,z)
 * projects to f*(x, -cos(p)*y-sin(p)*z)/(distance+sin(p)*y-cos(p)*z).
 * Solve those four viewport inequalities for distance, including perspective.
 * A cylinder's enclosing square works for every bearing, including the overview orbit.
 */
export function frameCamera(volume: FrameVolume, width: number, height: number, bearing: number, pitch = ROUND_PITCH, fov = 36.86989764584402, bottomInset = 0): FramedCamera {
  const p = pitch * Math.PI / 180, sin = Math.sin(p), cos = Math.cos(p);
  const f = Math.max(1, height) / (2 * Math.tan(fov * Math.PI / 360));
  const halfW = Math.max(1, width * 0.38);
  const upper = -Math.max(1, height * 0.38), lower = Math.max(1, height * 0.38 - bottomInset);
  const { radius: r, top } = volume;
  const distanceAt = (offset: number) => {
    let distance = 1;
    for (const y of [-r - offset, r - offset]) for (const z of [0, top]) {
      const depth = sin * y - cos * z;
      distance = Math.max(distance, f * r / halfW - depth, f * (-cos * y - sin * z) / ((-cos * y - sin * z) < 0 ? upper : lower) - depth, 1 - depth);
    }
    return distance;
  };
  // The maximum of affine inequalities is convex. Minimize distance by moving
  // the ground center towards the roof's screen position, then balance the frame.
  let low = -top * Math.tan(p) - r, high = top * Math.tan(p) + r;
  for (let i = 0; i < 50; i++) {
    const a = (2 * low + high) / 3, b = (low + 2 * high) / 3;
    if (distanceAt(a) < distanceAt(b)) high = b; else low = a;
  }
  const distance = distanceAt((low + high) / 2) * 1.02;
  low = -top * Math.tan(p) - r; high = top * Math.tan(p) + r;
  for (let i = 0; i < 50; i++) {
    const offset = (low + high) / 2;
    const ys = [-r - offset, r - offset].flatMap(y => [0, top].map(z => f * (-cos * y - sin * z) / (distance + sin * y - cos * z)));
    if (Math.min(...ys) + Math.max(...ys) > upper + lower) high = offset; else low = offset;
  }
  const offset = (low + high) / 2, b = bearing * Math.PI / 180;
  const meters = 40075016.68557849 * Math.cos(volume.center[1] * Math.PI / 180);
  const centerY = (1 - Math.log(Math.tan(Math.PI / 4 + volume.center[1] * Math.PI / 360)) / Math.PI) / 2 - offset * Math.cos(b) / meters;
  const center: Point = [volume.center[0] + offset * Math.sin(b) / meters * 360, Math.atan(Math.sinh(Math.PI * (1 - 2 * centerY))) * 180 / Math.PI];
  return { center, zoom: Math.min(22, Math.log2(f * meters / (512 * distance))), bearing, pitch };
}
