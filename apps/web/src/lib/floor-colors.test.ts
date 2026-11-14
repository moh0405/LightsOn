import { expect, it } from "vitest";
import { resolveFloorColor, withRevivedBuilding } from "./floor-colors";

it("resolves source floor status and lit overrides", () => {
  expect(resolveFloorColor("dark", "dark", "233953", 6, {})).toBe("#1a1d2b");
  expect(resolveFloorColor("partial", "dark", "233953", 6, {})).toBe("#4a4636");
  expect(resolveFloorColor("occupied", "dark", "233953", 6, {})).toBe("#f2c46d");
  expect(resolveFloorColor("unknown", "dark", "233953", 6, {})).toBe("#3a3f52");
  expect(resolveFloorColor("dark", "lit", "233953", 6, {})).toBe("#f2c46d");
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
