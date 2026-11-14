import { afterEach, expect, it, vi } from "vitest";
import { CityMusic } from "./music";
import { firstFloorAt } from "./effects";
const tone = { now: () => 10.1, immediate: () => 10 };
afterEach(() => { vi.useRealTimers(); });
it("schedules the first signature note on the first floor after the flash", () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const music = new CityMusic();
  const play = vi.fn();
  Reflect.set(music, "tone", tone);
  Reflect.set(music, "motif", { triggerAttackRelease: play });
  music.signature("", firstFloorAt(1000));
  expect(play).toHaveBeenCalledTimes(3);
  for (const [index, expected] of [10.2, 10.32, 10.44].entries()) expect(play.mock.calls[index]?.[2]).toBeCloseTo(expected);
});
it("starts a late signature immediately instead of scheduling in the past", () => {
  vi.useFakeTimers(); vi.setSystemTime(1500);
  const music = new CityMusic();
  const play = vi.fn();
  Reflect.set(music, "tone", tone);
  Reflect.set(music, "motif", { triggerAttackRelease: play });
  music.signature("", firstFloorAt(1000));
  expect(play.mock.calls[0]?.[2]).toBe(10);
});
