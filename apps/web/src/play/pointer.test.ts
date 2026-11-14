import { describe, expect, it } from "vitest";
import { aim, clamp, rateLimit, smooth, wrap180 } from "./pointer";
describe("phone aiming", () => {
  it("wraps across north in either direction", () => {
    expect(wrap180(358)).toBe(-2); expect(wrap180(-358)).toBe(2); expect(wrap180(540)).toBe(-180);
  });
  it("clamps to screen edges", () => { expect(clamp(-1)).toBe(0); expect(clamp(2)).toBe(1); expect(clamp(0.3)).toBe(0.3); });
  it("calibrates the center and respects yaw and pitch signs", () => {
    expect(aim(359, 20, 359, 20)).toEqual({ x: 0.5, y: 0.5 });
    expect(aim(29, 40, 359, 20)).toEqual({ x: 0, y: 0 });
  });
  it("smooths sensor jitter", () => { expect(smooth({ x: 0, y: 1 }, { x: 1, y: 0 })).toEqual({ x: 0.35, y: 0.65 }); });
  it("sends at most 30 times per second", () => {
    const allow = rateLimit();
    expect(Array.from({ length: 1000 }, (_, t) => allow(t)).filter(Boolean)).toHaveLength(30);
    expect(allow(1000)).toBe(false); expect(allow(1020)).toBe(true);
  });
});
