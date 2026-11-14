import { describe, expect, it } from "vitest";
import { factDescription } from "./buildings";

describe("aerial evidence display", () => {
  it("keeps the full capture date and visibly qualifies estimates", () => {
    const text = "on the 2022-02-19 flyover, 8 cars detected within about 30 m of the parcel";
    expect(factDescription({ key: "vexcel_detection_car", value: 8, say_as: text, source: "vexcel+vision", kind: "estimate" })).toBe(`Estimate · ${text}`);
  });
  it("keeps an unknown capture unknown", () => {
    const text = "in imagery with an unknown capture date, 31 cars detected within about 30 m of the parcel";
    expect(factDescription({ key: "vexcel_detection_car", value: 31, say_as: text, source: "vexcel+vision", kind: "estimate" })).toBe(`Estimate · ${text}`);
  });
});
