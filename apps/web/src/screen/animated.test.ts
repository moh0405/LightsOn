import { expect, it } from "vitest";
import { tween } from "./animated";
it("animates server meter values without overshooting in either direction", () => {
  expect(tween(0, 94509, -1)).toBe(0);
  expect(tween(0, 94509, 1)).toBe(94509);
  expect(tween(45, 30, 2)).toBe(30);
  expect(tween(0, 100, 0.5)).toBe(88);
});
