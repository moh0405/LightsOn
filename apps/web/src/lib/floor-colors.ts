import type { ExpressionSpecification } from "maplibre-gl";
import type { Status } from "./buildings";

export type RevivedColors = Record<string, { floors: number[]; color: string }>;
const GOLD = "#f2c46d";
const SOURCE_COLORS: Record<Status, string> = { dark: "#1a1d2b", partial: "#4a4636", occupied: GOLD, unknown: "#3a3f52" };
const SOURCE_EXPRESSION: ExpressionSpecification = ["match", ["get", "source_status"], "dark", SOURCE_COLORS.dark, "partial", SOURCE_COLORS.partial, "occupied", GOLD, SOURCE_COLORS.unknown];

export function withRevivedBuilding(previous: RevivedColors, buildingId: string, floors: number[], color: string): RevivedColors {
  return { ...previous, [buildingId]: { floors: [...floors], color } };
}
export function resolveFloorColor(source: Status, game: string | null, buildingId: string, floor: number, revived: RevivedColors): string {
  const entry = revived[buildingId];
  if (entry?.floors.includes(floor)) return entry.color;
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
      const color: string | ExpressionSpecification = progress === 1 ? entry.color : ["interpolate", ["linear"], ["literal", progress], 0, SOURCE_EXPRESSION, 1, entry.color];
      result = ["case", ["all", ["==", ["get", "building_id"], id], ["==", ["get", "floor_number"], floor]], color, result];
    }
  }
  return result;
}
