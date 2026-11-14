import { expect, it, vi } from "vitest";
const { loaded } = vi.hoisted(() => ({ loaded: vi.fn() }));
vi.mock("tone", () => { loaded(); return {}; });
import { CityMusic, audioSupported } from "./music";

it("does not load Tone on import and refuses to start without Web Audio", async () => {
  expect(audioSupported()).toBe(false); // vitest's node environment has no AudioContext
  const music = new CityMusic();
  music.revive("housing"); music.duck(true); music.signature("x"); // no-ops before start
  await expect(music.start()).rejects.toThrow("Audio unavailable");
  expect(loaded).not.toHaveBeenCalled();
});
