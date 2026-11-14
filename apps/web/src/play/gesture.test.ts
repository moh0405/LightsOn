import { describe, expect, it } from "vitest";
import { createFlickDetector } from "./gesture";
describe("flick detector", () => {
  it("requires a low sample then a peak above 14 within 300ms", () => {
    const flick = createFlickDetector();
    expect(flick(16, 0)).toBe(false);
    expect(flick(8, 10)).toBe(false);
    expect(flick(14, 100)).toBe(false);
    expect(flick(15, 310)).toBe(true);
    expect(flick(18, 320)).toBe(false);
  });
  it("rejects slow peaks and enforces the 600ms refractory window", () => {
    const flick = createFlickDetector();
    flick(8, 0); expect(flick(15, 301)).toBe(false);
    flick(8, 400); expect(flick(15, 450)).toBe(true);
    flick(8, 800); expect(flick(15, 1049)).toBe(false);
    flick(8, 1050); expect(flick(15, 1051)).toBe(true);
  });
  it("ignores missing and invalid sensor samples", () => {
    const flick = createFlickDetector();
    expect(flick(null, 0)).toBe(false);
    expect(flick(NaN, 0)).toBe(false);
    flick(8, 100); expect(flick(15, 99)).toBe(false);
  });
});
