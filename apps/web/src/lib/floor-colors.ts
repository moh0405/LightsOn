import type { ExpressionSpecification } from "maplibre-gl";
import type { Status } from "./buildings";

export type RevivedColors = Record<string, { floors: number[]; color: string }>;
const GOLD = "#f2c46d";
const SOURCE_COLORS: Record<Status, string> = { dark: "#1a1d2b", partial: "#4a4636", occupied: GOLD, unknown: "#3a3f52" };

/** Phase 3's validated building_revived event will supply these values. */
export function withRevivedBuilding(previous: RevivedColors, buildingId: string, floors: number[], color: string): RevivedColors {
  return { ...previous, [buildingId]: { floors: [...floors], color } };
}
export function resolveFloorColor(source: Status, game: string, buildingId: string, floor: number, revived: RevivedColors): string {
  if (game === "revived") {
    const entry = revived[buildingId];
    return entry?.floors.includes(floor) ? entry.color : GOLD;
  }
  return game === "lit" ? GOLD : SOURCE_COLORS[source];
}
export function floorColorExpression(revived: RevivedColors): ExpressionSpecification {
  let revival: string | ExpressionSpecification = GOLD;
  for (const [id, entry] of Object.entries(revived)) {
    revival = ["case", ["all", ["==", ["get", "building_id"], id], ["in", ["get", "floor_number"], ["literal", entry.floors]]], entry.color, revival];
  }
  return ["case",
    ["==", ["get", "game_status"], "revived"], revival,
    ["==", ["get", "game_status"], "lit"], GOLD,
    ["match", ["get", "source_status"], "dark", SOURCE_COLORS.dark, "partial", SOURCE_COLORS.partial, "occupied", GOLD, SOURCE_COLORS.unknown],
  ];
}
