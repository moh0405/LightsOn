import { expect, it } from "vitest";
import { resolveFloorColor, withRevivedBuilding } from "./floor-colors";

it("resolves source floor status until revival", () => {
  expect(resolveFloorColor("dark", "dark", "233953", 6, {})).toBe("#1a1d2b");
  expect(resolveFloorColor("partial", "dark", "233953", 6, {})).toBe("#4a4636");
  expect(resolveFloorColor("occupied", "dark", "233953", 6, {})).toBe("#f2c46d");
  expect(resolveFloorColor("unknown", "dark", "233953", 6, {})).toBe("#3a3f52");
  for (const game of [null, "dark", "lit"]) {
    expect(resolveFloorColor("partial", game, "233953", 6, {})).toBe("#4a4636");
    expect(resolveFloorColor("unknown", game, "233953", 6, {})).toBe("#3a3f52");
    expect(resolveFloorColor("dark", game, "233953", 6, {})).toBe("#1a1d2b");
  }
});
it("uses warm gold until a revival supplies ownership, and colors only its floors", () => {
  expect(resolveFloorColor("dark", "revived", "233953", 6, {})).toBe("#f2c46d");
  const previous = {};
  const floors = [6, 7, 8];
  const next = withRevivedBuilding(previous, "233953", floors, "#00ccff");
  floors.push(9);
  expect(previous).toEqual({});
  expect(resolveFloorColor("dark", "revived", "233953", 6, next)).toBe("#00ccff");
  expect(resolveFloorColor("dark", "revived", "233953", 9, next)).toBe("#f2c46d");
  expect(resolveFloorColor("unknown", "revived", "233899", 6, next)).toBe("#f2c46d");
});

import { floorColorExpression } from "./floor-colors";
it("overlays authoritative revived colors even when source game_status is dark", () => {
  const colors = { "233953": { floors: [8, 6, 7], color: "#00ccff" } };
  expect(resolveFloorColor("dark", "dark", "233953", 6, colors)).toBe("#00ccff");
  expect(resolveFloorColor("unknown", "dark", "233953", 9, colors)).toBe("#3a3f52");
  const animation = { building_id: "233953", floors: [8, 6, 7], at: 1000 };
  const halfway = JSON.stringify(floorColorExpression(colors, animation, 1300));
  expect(halfway).toContain('["literal",0.5]');
  expect(halfway).toContain('["literal",0.4]');
  expect(halfway).toContain('["literal",0.3]');
  expect(JSON.stringify(floorColorExpression(colors, animation, 1720))).not.toContain('interpolate');
  expect(JSON.stringify(floorColorExpression(colors))).toContain('#00ccff');
});
