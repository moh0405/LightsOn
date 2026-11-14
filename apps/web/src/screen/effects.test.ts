import { describe, expect, it } from "vitest";
import { INTRO_DIVE_MS, MEDIA_BEAT_MS, floorProgress, lightUpDuration, mediaAt, mediaPlan } from "./effects";

describe("payoff timing", () => {
  it("lights sorted floors immediately, staggers 60ms, fades for 600ms", () => {
    expect(floorProgress([8, 6, 7], 6, 300)).toBe(0.5);
    expect(floorProgress([8, 6, 7], 7, 60)).toBe(0);
    expect(floorProgress([8, 6, 7], 7, 360)).toBe(0.5);
    expect(lightUpDuration([8, 6, 7])).toBe(720);
    expect(lightUpDuration([])).toBe(0);
  });
  it("plays camera, ortho, obliques, tour then subtitles without owning the phase", () => {
    const beats = mediaPlan({ aerial: { ortho: "/media/233953/ortho.jpg", obliques: ["/media/233953/oblique-east.jpg"] }, matterport: [{ model_id: "Wtxv2Mp8uQE", caption: null }] }, "233953");
    expect(beats.map((b) => b.kind)).toEqual(["aerial", "aerial", "matterport"]);
    expect(mediaAt(beats, INTRO_DIVE_MS - 1)).toBeNull();
    expect(mediaAt(beats, INTRO_DIVE_MS)).toEqual(beats[0]);
    expect(mediaAt(beats, INTRO_DIVE_MS + MEDIA_BEAT_MS)).toEqual(beats[1]);
    expect(mediaAt(beats, INTRO_DIVE_MS + MEDIA_BEAT_MS * 3)).toBeNull();
  });
  it("keeps missing media and dates unknown and rejects non-local aerial paths", () => {
    expect(mediaPlan(null, "233953")).toEqual([]);
    expect(mediaPlan({ aerial: { ortho: "https://example.com/photo" }, matterport: [{ model_id: "../bad" }] }, "233953")).toEqual([]);
    const beats = mediaPlan({ aerial: { ortho: "/media/233953/ortho.jpg" } }, "233953");
    expect(beats[0]?.captureDate).toBeNull();
    expect(beats[0]?.caption).toContain("Estimate");
  });
});
