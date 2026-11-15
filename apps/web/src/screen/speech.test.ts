import { afterEach, expect, it, vi } from "vitest";
import { useGame, initialGame } from "../lib/store";

// Mount the existing screen hook without a DOM; exercise the real store subscription.
const effects: (() => void | (() => void))[] = [];
vi.mock("react", async (original) => ({ ...await original<object>(), useState: (value: unknown) => [value === false ? true : value, vi.fn()],
  useRef: (value: unknown) => ({ current: value === null ? { duck, restore: vi.fn(), revive: vi.fn(), signature: vi.fn(), dispose: vi.fn() } : value }),
  useEffect: (effect: () => void | (() => void)) => effects.push(effect) }));
import { browserSpeech, speechChunks, useScreenAudio } from "./music";
class Utterance {
  text: string; voice = null; rate = 1; pitch = 1;
  onend: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(text: string) { this.text = text; }
}
const cleanups: (() => void)[] = [];
const spoken: Utterance[] = [];
const duck = vi.hoisted(() => vi.fn());
const cancel = vi.fn();
async function mount() {
  useGame.setState({ ...initialGame, room: "test", roundId: "round", phase: "INTRO" });
  spoken.length = 0; effects.length = 0;
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  const synth = new EventTarget();
  Object.assign(synth, { speak: (u: Utterance) => spoken.push(u), cancel, getVoices: () => [{ name: "Samantha", lang: "en-US", default: true }] });
  vi.stubGlobal("window", { speechSynthesis: synth });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ audio_url: null }) }));
  useScreenAudio();
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
afterEach(() => { cleanups.splice(0).forEach(c => c()); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });
it("finishes the verdict across POWER_UP without canceling the voice", async () => {
  await mount();
  useGame.setState({ phase: "VERDICT", verdict: { reason_line: "Thank you for listening." } as NonNullable<typeof initialGame.verdict> });
  await flush();
  const before = cancel.mock.calls.length;
  useGame.setState({ phase: "POWER_UP" });
  expect(cancel.mock.calls.length).toBe(before);
});
it("does not repeat an intro on room_state replay", async () => {
  await mount();
  const intro = { text: "Thank you for listening.", audio_url: null, mood: "hopeful" as const, analyst_line: "" };
  useGame.setState({ intro }); await flush();
  spoken[0]?.onend?.(); await flush();
  useGame.setState({ intro: { ...intro } }); await flush();
  expect(spoken).toHaveLength(1);
});

it("serializes both players, dedupes replays, and keeps ducking until each line ends", async () => {
  await mount();
  const offer = { line: "Thank you.", counteroffer: "Please tell me more.", audio_url: null, fact_ids: [] };
  useGame.setState({ phase: "CHALLENGE", counteroffers: { ann: { ...offer, player_id: "ann" }, bo: { ...offer, player_id: "bo" } } });
  await flush();
  expect(spoken.map(u => u.text)).toEqual(["Thank you."]);
  expect(duck).toHaveBeenLastCalledWith(true);
  useGame.setState({ phase: "NEGOTIATE" });
  spoken[0]!.onend!(); await flush();
  expect(spoken[1]!.text).toBe("Please tell me more.");
  expect(duck).toHaveBeenLastCalledWith(true);
  spoken[1]!.onend!(); await flush();
  expect(spoken[2]!.text).toBe("Thank you.");
  useGame.setState({ counteroffers: structuredClone(useGame.getState().counteroffers) });
  spoken[2]!.onend!(); await flush(); spoken[3]!.onend!(); await flush();
  expect(spoken).toHaveLength(4);
  expect(duck).toHaveBeenLastCalledWith(false);
});
it("finishes an active challenge but skips stale queued challenges after a host advances", async () => {
  await mount();
  const offer = { line: "Thank you.", counteroffer: "", audio_url: null, fact_ids: [] };
  useGame.setState({ phase: "CHALLENGE", counteroffers: { ann: { ...offer, player_id: "ann" }, bo: { ...offer, player_id: "bo" } } });
  await flush();
  useGame.setState({ phase: "VERDICT", verdict: { reason_line: "Welcome." } as NonNullable<typeof initialGame.verdict> });
  spoken[0]!.onend!(); await flush();
  expect(spoken.map(u => u.text)).toEqual(["Thank you.", "Welcome."]);
});
it("cancels on a new round and does not enqueue the remaining chunks", async () => {
  await mount();
  useGame.setState({ intro: { text: "Thank you. Please listen.", audio_url: null, mood: "hopeful", analyst_line: "" } });
  await flush();
  useGame.setState({ roundId: null, phase: "EXPLORE", intro: null }); await flush();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(spoken).toHaveLength(1);
  expect(duck).toHaveBeenLastCalledWith(false);
});
it("waits for voiceschanged and selects a natural English voice, not a novelty voice", async () => {
  await mount();
  const synth = window.speechSynthesis;
  vi.spyOn(synth, "getVoices").mockReturnValue([]);
  const promise = browserSpeech("Thank you.", { voice_style: "warm", voice_id: "" }, "bitter", new AbortController().signal);
  await flush(); expect(spoken).toHaveLength(0);
  vi.spyOn(synth, "getVoices").mockReturnValue([{ name: "Bells", lang: "en-US", default: true }, { name: "Samantha", lang: "en-US", default: false }] as SpeechSynthesisVoice[]);
  synth.dispatchEvent(new Event("voiceschanged")); await flush();
  expect(spoken[0]!.voice).toMatchObject({ name: "Samantha" });
  expect([spoken[0]!.rate, spoken[0]!.pitch]).toEqual([1, 1]);
  spoken[0]!.onend!(); await promise;
});
it("bounds voice discovery and aborts it without speaking", async () => {
  vi.useFakeTimers(); await mount();
  vi.spyOn(window.speechSynthesis, "getVoices").mockReturnValue([]);
  const controller = new AbortController();
  const aborted = browserSpeech("Thank you.", { voice_style: "", voice_id: "" }, "proud", controller.signal);
  controller.abort(); await aborted; expect(spoken).toHaveLength(0);
  const fallback = browserSpeech("Thank you.", { voice_style: "", voice_id: "" }, "proud", new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1000); expect(spoken).toHaveLength(1);
  spoken[0]!.onend!(); await fallback;
});
it("splits long lines at sentence/word boundaries without changing numbers or speaking markup", () => {
  const line = "<em>Thank you.</em> [Please listen](https://example.test) [F_233953_buildingName] **Welcome.**";
  expect(speechChunks(line)).toEqual(["Thank you.", "Please listen Welcome."]);
  expect(speechChunks("Version 1.25 is ready.")).toEqual(["Version 1.25 is ready."]);
  const long = "Please listen carefully ".repeat(30).trim();
  const chunks = speechChunks(long);
  expect(chunks.every(chunk => chunk.length <= 140 && chunk.split(" ").length <= 22)).toBe(true);
  expect(chunks.join(" ")).toBe(long);
});
it("does not impose a 20-second limit on an entire multi-sentence line", async () => {
  vi.useFakeTimers(); await mount();
  const promise = browserSpeech("Thank you. Please listen. Welcome.", { voice_style: "", voice_id: "" }, "anxious", new AbortController().signal);
  await flush();
  for (let index = 0; index < 3; index++) {
    await vi.advanceTimersByTimeAsync(9000); spoken[index]!.onend!(); await flush();
  }
  await promise; expect(cancel).not.toHaveBeenCalled(); expect(spoken).toHaveLength(3);
});
it("allows a real challenge to replace the live agent's preliminary line", async () => {
  await mount();
  const offer = { player_id: "ann", line: "Please wait.", counteroffer: "", audio_url: null, fact_ids: [] };
  useGame.setState({ phase: "CHALLENGE", counteroffers: { ann: offer } }); await flush();
  spoken[0]!.onend!(); await flush();
  useGame.setState({ counteroffers: { ann: { ...offer, line: "Thank you." } } }); await flush();
  expect(spoken.map(u => u.text)).toEqual(["Please wait.", "Thank you."]);
});
it("does not start a stale line after a delayed TTS response", async () => {
  await mount();
  let release!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(resolve => { release = resolve; }));
  useGame.setState({ intro: { text: "Thank you.", audio_url: null, mood: "proud", analyst_line: "" } }); await flush();
  useGame.setState({ phase: "VERDICT" });
  release({ ok: true, json: async () => ({ audio_url: null }) } as Response); await flush();
  expect(spoken).toHaveLength(0);
  expect(duck).toHaveBeenLastCalledWith(false);
});
