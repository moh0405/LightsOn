import type { ExpressionSpecification } from "maplibre-gl";
import type { FloorStates } from "./protocol";
import type { Status } from "./buildings";

export type RevivedColors = Record<string, { floors: number[]; color: string; floorColors?: Record<string, string> }>;
const GOLD = "#f2c46d";
const SOURCE_COLORS: Record<Status, string> = { dark: "#1a1d2b", partial: "#4a4636", occupied: GOLD, unknown: "#3a3f52" };
const SOURCE_EXPRESSION: ExpressionSpecification = ["match", ["get", "source_status"], "dark", SOURCE_COLORS.dark, "partial", SOURCE_COLORS.partial, "occupied", GOLD, SOURCE_COLORS.unknown];

export function withRevivedBuilding(previous: RevivedColors, buildingId: string, floors: number[], color: string): RevivedColors {
  const old = previous[buildingId];
  const floorColors = Object.fromEntries((old?.floors ?? []).map((n) => [String(n), old?.floorColors?.[String(n)] ?? old!.color]));
  for (const floor of floors) floorColors[String(floor)] = color;
  return { ...previous, [buildingId]: { floors: [...new Set([...(old?.floors ?? []), ...floors])].sort((a, b) => a - b), color, floorColors } };
}
/** Prefer precise per-floor ownership; older snapshots retain their building color. */
export function restoreRevivedColors(revived: RevivedColors, states?: FloorStates): RevivedColors {
  let result = { ...revived };
  for (const [id, floors] of Object.entries(states ?? {})) {
    for (const [floor, state] of Object.entries(floors)) {
      if (state.game_status === "revived" && Number.isFinite(Number(floor))) result = withRevivedBuilding(result, id, [Number(floor)], state.color);
    }
  }
  return result;
}
export function resolveFloorColor(source: Status, game: string | null, buildingId: string, floor: number, revived: RevivedColors): string {
  const entry = revived[buildingId];
  if (entry?.floors.includes(floor)) return entry.floorColors?.[String(floor)] ?? entry.color;
  return game === "revived" ? GOLD : SOURCE_COLORS[source];
}
interface LightUp { building_id: string; floors: number[]; at: number }
/** Authoritative game colors overlay source status without rewriting source facts. */
export function floorColorExpression(revived: RevivedColors, animation?: LightUp, now = Date.now()): ExpressionSpecification {
  let result: ExpressionSpecification = ["case", ["==", ["get", "game_status"], "revived"], GOLD, SOURCE_EXPRESSION];
  for (const [id, entry] of Object.entries(revived)) {
    const sorted = [...entry.floors].sort((a, b) => a - b);
    for (const floor of sorted) {
      const index = animation ? [...animation.floors].sort((a, b) => a - b).indexOf(floor) : 0;
      const progress = animation?.building_id === id && animation.floors.includes(floor)
        ? Math.max(0, Math.min(1, (now - animation.at - index * 60) / 600)) : 1;
      const target = entry.floorColors?.[String(floor)] ?? entry.color;
      const color: string | ExpressionSpecification = progress === 1 ? target : ["interpolate", ["linear"], ["literal", progress], 0, SOURCE_EXPRESSION, 1, target];
      result = ["case", ["all", ["==", ["get", "building_id"], id], ["==", ["get", "floor_number"], floor]], color, result];
    }
  }
  return result;
}
