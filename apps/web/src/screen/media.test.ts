import { afterEach, expect, it, vi } from "vitest";
import { getDossier } from "../lib/buildings";
import { loadMedia } from "./media";
vi.mock("../lib/buildings", () => ({ getDossier: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks(); });
it("logs unavailable dossiers and reports a subtitle fallback", async () => {
  vi.mocked(getDossier).mockRejectedValue(new Error("offline"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const toast = vi.fn();
  expect(await loadMedia("233953", toast)).toEqual([]);
  expect(warn).toHaveBeenCalledOnce();
  expect(toast).toHaveBeenCalledWith(expect.stringContaining("subtitles"));
});
it("missing media is skipped without fetching guessed image paths", async () => {
  vi.mocked(getDossier).mockResolvedValue({ id: "233953", name: null, stories: null, floors: null, facts: null });
  const toast = vi.fn();
  expect(await loadMedia("233953", toast)).toEqual([]);
  expect(toast).not.toHaveBeenCalled();
});
