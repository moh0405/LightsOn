import { describe, expect, it } from "vitest";
import { demoPresetText } from "./AdminApp";

describe("demoPresetText", () => {
  it("states the demo timers and wake list when DEMO_MODE is on", () => {
    expect(demoPresetText(true)).toContain("pitch 20 s, negotiate 15 s");
    expect(demoPresetText(true)).toContain("Esperson only");
  });
  it("explains how to turn the preset on, and never claims a state it does not know", () => {
    expect(demoPresetText(false)).toContain("DEMO_MODE=1");
    expect(demoPresetText(null)).toContain("unknown");
  });
});
