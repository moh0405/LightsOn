import { expect, it } from "vitest";
import { MAX_LIFT_DB, emptyMusic, reviveLayer, layerDb, categoryLayers } from "./music";

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

it("caps the repeat lift at +6 dB", () => {
  let state = emptyMusic();
  for (let i = 0; i < 6; i++) state = reviveLayer(state, "housing");
  expect(state.housing).toBe(MAX_LIFT_DB);
  expect(MAX_LIFT_DB).toBe(6);
  expect(layerDb(state, "housing", false)).toBe(-18);
});
