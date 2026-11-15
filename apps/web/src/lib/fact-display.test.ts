import { describe, expect, it } from "vitest";
import { evidenceLine, factDescription, factLabel, sourceLabel, wholeNumbers } from "./buildings";

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

describe("projector evidence lines", () => {
  it("drops float '.0' and never shows the fact id", () => {
    const fact = { id: "F_233953_floor_20_available_sqft", key: "floor_20_available_sqft", value: 9068.0, say_as: "9,068.0 sqft", source: "costar", kind: "verified" as const };
    const line = evidenceLine(fact);
    expect(line).toBe("CoStar · Floor 20 available: 9,068 sqft");
    expect(line).not.toContain("F_");
  });
  it("keeps real decimals and labels aerial sentences by source", () => {
    expect(wholeNumbers("280,852.0 sqft, 12.5 ft, 2.05 m")).toBe("280,852 sqft, 12.5 ft, 2.05 m");
    const text = "on the 2022-02-19 flyover, 8 cars detected within about 30 m of the parcel";
    expect(evidenceLine({ key: "vexcel_detection_car", value: 8, say_as: text, source: "vexcel+vision", kind: "estimate" })).toBe(`Vexcel · Estimate · ${text}`);
    expect(factLabel("rentableBuildingAreaSquareFeet")).toBe("Rentable building area");
    expect(sourceLabel(undefined)).toBe("Source");
  });
});

import { availableSpaceLine } from "./buildings";
describe("available space line (A10)", () => {
  it("labels the dossier quantity as listed available space", () => {
    expect(availableSpaceLine("280,852.0 sqft", null)).toBe("Available space: 280,852 sqft");
    expect(availableSpaceLine(null, 12000)).toBe("Available space: 12,000 sq ft");
    expect(availableSpaceLine(null, null)).toBeNull();
  });
});
