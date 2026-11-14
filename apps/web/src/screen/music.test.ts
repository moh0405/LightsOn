import { expect, it } from "vitest";
import { emptyMusic, reviveLayer, layerDb, categoryLayers } from "./music";

it("maps eight categories to eight instruments, adding a layer once then lifting 3 dB", () => {
  expect(Object.keys(categoryLayers)).toHaveLength(8);
  const first = reviveLayer(emptyMusic(), "housing");
  expect(first.housing).toBe(0);
  expect(first.food_retail).toBeNull();
  const next = reviveLayer(first, "housing");
  expect(next.housing).toBe(3);
  expect(layerDb(next, "housing", false)).toBe(-21);
  expect(layerDb(next, "housing", true)).toBe(-29);
  expect(layerDb(next, "food_retail", true)).toBe(-Infinity);
  expect(first.housing).toBe(0);
});
