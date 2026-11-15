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
    if (distance < 8 || distance > RANGE_M) return;
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
  const faded = near.filter((o) => angleDiff(o.azimuth, side) <= halfAngle(o, heroRadius, FADE_SECTOR_DEG) && excess(o, targetM, pitch, heroRadius) > 0).map((o) => o.index);
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
