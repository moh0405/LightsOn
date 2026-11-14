import { describe, expect, it } from "vitest";
import { boundMediaPlan, INTRO_DIVE_MS, MEDIA_BEAT_MS, lightUpDuration, mediaAt, mediaPlan } from "./effects";

describe("payoff timing", () => {
  it("waits for the final staggered floor fade before the concept card", () => {
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
  it("reserves a tour beat inside the eight-second INTRO even with four obliques", () => {
    const beats = mediaPlan({ aerial: { ortho: "/media/233953/ortho.jpg", obliques: ["east", "north", "south", "west"].map((direction) => `/media/233953/oblique-${direction}.jpg`) }, matterport: [{ model_id: "Wtxv2Mp8uQE", caption: null }] }, "233953");
    const bounded = boundMediaPlan(beats);
    expect(bounded.map((b) => b.kind)).toEqual(["aerial", "aerial", "aerial", "matterport"]);
    expect(INTRO_DIVE_MS + bounded.length * MEDIA_BEAT_MS).toBeLessThan(8000);
    expect(MEDIA_BEAT_MS).toBeGreaterThanOrEqual(1000);
    expect(MEDIA_BEAT_MS).toBeLessThanOrEqual(2000);
  });
  it("keeps missing media and dates unknown and rejects non-local aerial paths", () => {
    expect(mediaPlan(null, "233953")).toEqual([]);
    expect(mediaPlan({ aerial: { ortho: "https://example.com/photo" }, matterport: [{ model_id: "../bad" }] }, "233953")).toEqual([]);
    const beats = mediaPlan({ aerial: { ortho: "/media/233953/ortho.jpg" } }, "233953");
    expect(beats[0]?.captureDate).toBeNull();
    expect(beats[0]?.caption).toContain("Estimate");
  });
});
