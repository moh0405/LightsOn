import { afterEach, expect, it, vi } from "vitest";
import { useGame, initialGame } from "../lib/store";

// Mount the existing screen hook without a DOM; exercise the real store subscription.
const effects: (() => void | (() => void))[] = [];
vi.mock("react", async (original) => ({ ...await original<object>(), useState: (value: unknown) => [value === false ? true : value, vi.fn()],
  useRef: (value: unknown) => ({ current: value === null ? { duck, restore: vi.fn(), revive: vi.fn(), signature: vi.fn(), dispose: vi.fn() } : value }),
  useEffect: (effect: () => void | (() => void)) => effects.push(effect) }));
import { browserSpeech, budgetLine, speechChunks, spokenWords, useScreenAudio } from "./music";
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
it("never cuts a challenge sentence when the host advances; the rest is dropped and the verdict follows", async () => {
  await mount();
  const offer = { line: "Thank you.", counteroffer: "Please listen.", audio_url: null, fact_ids: ["F_233953_dark_floor_count"] };
  useGame.setState({ phase: "CHALLENGE", counteroffers: { ann: { ...offer, player_id: "ann" }, bo: { ...offer, player_id: "bo" } } });
  await flush();
  useGame.setState({ phase: "VERDICT", verdict: { reason_line: "Welcome." } as NonNullable<typeof initialGame.verdict> });
  await flush();
  expect(cancel).not.toHaveBeenCalled();
  expect(spoken.map(u => u.text)).toEqual(["Thank you."]);
  spoken[0]!.onend!(); await flush();
  expect(spoken.map(u => u.text)).toEqual(["Thank you.", "Welcome."]);
});
it("A07: the sentence in the air at NEGOTIATE finishes; later sentences and the queued player are dropped", async () => {
  await mount();
  const offer = { line: "Thank you.", counteroffer: "Please listen.", audio_url: null, fact_ids: [] };
  useGame.setState({ phase: "CHALLENGE", counteroffers: { ann: { ...offer, player_id: "ann" }, bo: { ...offer, player_id: "bo" } } });
  await flush();
  useGame.setState({ phase: "NEGOTIATE" }); await flush();
  expect(cancel).not.toHaveBeenCalled();
  spoken[0]!.onend?.(); await flush();
  expect(spoken.map(u => u.text)).toEqual(["Thank you."]);
  expect(duck).toHaveBeenLastCalledWith(false);
});
it("A07: budgets a live challenge that arrives before the server arms the CHALLENGE timer", async () => {
  await mount();
  const offer = { line: "Dollface, 150,365 square feet across my dark floors await your pitch.", counteroffer: "What footprint would your shared space need? Give your community space a reason to buzz after sunset.", audio_url: null, fact_ids: ["F_233953_dark_floor_count"] };
  useGame.setState({ phase: "CHALLENGE", endsAt: null,
    pitches: { ann: { player_id: "ann", text: "a" }, bo: { player_id: "bo", text: "b" } } as unknown as typeof initialGame.pitches,
    counteroffers: { ann: { ...offer, player_id: "ann" } } });
  await flush();
  // Half of the 10 s window: the ask fits, the 18-spoken-word fact line does not.
  expect(spoken.map(u => u.text)).toEqual(["What footprint would your shared space need?"]);
  spoken[0]!.onend!(); await flush();
  expect(spoken).toHaveLength(1);
});
it("skips a stalled sentence and continues with the next one, without an error", async () => {
  vi.useFakeTimers(); await mount();
  let failed = false;
  const promise = browserSpeech("Thank you. Please listen.", { voice_style: "", voice_id: "" }, "hopeful", new AbortController().signal).catch(() => { failed = true; });
  await flush();
  (spoken[0] as Utterance & { onstart?: () => void }).onstart?.();
  await vi.advanceTimersByTimeAsync(3100); // two words: 1 s expected + 2 s grace
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(spoken.map(u => u.text)).toEqual(["Thank you.", "Please listen."]);
  spoken[1]!.onend!(); await promise;
  expect(failed).toBe(false);
});
it("A07: does not start a challenge first reported during NEGOTIATE", async () => {
  await mount();
  useGame.setState({ phase: "NEGOTIATE", counteroffers: { ann: { player_id: "ann", line: "Thank you.", counteroffer: "Please listen.", audio_url: null, fact_ids: [] } } });
  await flush();
  expect(spoken).toHaveLength(0);
});
it("A07: budgets both players' challenges inside the CHALLENGE window", async () => {
  await mount();
  const long = "Thank you for the pitch about the empty upper floors and the lobby. ";
  const offer = { line: long.repeat(2).trim(), counteroffer: "Please listen. Bring me a tenant for floor nine and a plan for the lobby and the roof.", audio_url: null, fact_ids: [] };
  useGame.setState({ phase: "CHALLENGE", endsAt: new Date(Date.now() + 10_000).toISOString(),
    pitches: { ann: { player_id: "ann", text: "a" }, bo: { player_id: "bo", text: "b" } } as unknown as typeof initialGame.pitches,
    counteroffers: { ann: { ...offer, player_id: "ann" }, bo: { ...offer, player_id: "bo", counteroffer: "Hear me out. Bring me a tenant." } } });
  await flush();
  const ann: string[] = [];
  while (spoken[ann.length] && !spoken[ann.length]!.text.includes("Hear me out")) {
    const u = spoken[ann.length]!; ann.push(u.text); u.onend!(); await flush();
  }
  const count = (texts: string[]) => texts.join(" ").split(" ").length;
  // ann may use at most half of the 10 s window at ~2.4 words per second.
  expect(count(ann)).toBeLessThanOrEqual(12);
  expect(ann.join(" ")).toContain("Please listen.");
  expect(spoken.length).toBeGreaterThan(ann.length); // bo starts right after ann
});
it("keeps a short challenge whole and shortens a long one at a sentence boundary", () => {
  expect(budgetLine("Thank you.", "Please listen.", 20)).toBe("Thank you. Please listen.");
  expect(budgetLine("Thank you for this lovely idea about the lobby.", "Please listen. Bring a tenant.", 6)).toBe("Please listen. Bring a tenant.");
  expect(budgetLine("Thank you.", "Please listen. Bring me a tenant for nine floors today.", 4)).toBe("Please listen.");
  expect(budgetLine("Thank you.", "Bring me a tenant for nine floors today.", 4)).toBe("Bring me a tenant…");
  expect(budgetLine("Thank you.", "Bring me a tenant.", 2)).toBe("");
  // Numbers are read out digit group by digit group: "150,365" costs eight words.
  expect(spokenWords("150,365 square feet")).toBe(9);
  expect(budgetLine("I have 150,365 square feet.", "Tell me more.", 8)).toBe("Tell me more.");
});
it("a new round lets the sentence in the air finish and does not enqueue the remaining chunks", async () => {
  await mount();
  useGame.setState({ intro: { text: "Thank you. Please listen.", audio_url: null, mood: "hopeful", analyst_line: "" } });
  await flush();
  useGame.setState({ roundId: null, phase: "EXPLORE", intro: null }); await flush();
  expect(cancel).not.toHaveBeenCalled();
  spoken[0]!.onend!(); await flush();
  expect(spoken).toHaveLength(1);
  expect(duck).toHaveBeenLastCalledWith(false);
});
it("a room change (reset) is the only thing that interrupts a sentence", async () => {
  await mount();
  useGame.setState({ intro: { text: "Thank you. Please listen.", audio_url: null, mood: "hopeful", analyst_line: "" } });
  await flush();
  useGame.setState({ room: "other", roundId: null, phase: "LOBBY", intro: null }); await flush();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(spoken).toHaveLength(1);
});
it("uses a natural English voice immediately, not a novelty voice", async () => {
  await mount();
  vi.spyOn(window.speechSynthesis, "getVoices").mockReturnValue([{ name: "Bells", lang: "en-US", default: true }, { name: "Samantha", lang: "en-US", default: false }] as SpeechSynthesisVoice[]);
  const promise = browserSpeech("Thank you.", { voice_style: "warm", voice_id: "" }, "bitter", new AbortController().signal);
  expect(spoken[0]!.voice).toMatchObject({ name: "Samantha" });
  expect([spoken[0]!.rate, spoken[0]!.pitch]).toEqual([1, 1]);
  spoken[0]!.onend!(); await promise;
});
it("uses the browser default without a one-second voice-discovery delay", async () => {
  await mount();
  vi.spyOn(window.speechSynthesis, "getVoices").mockReturnValue([]);
  const controller = new AbortController();
  const promise = browserSpeech("Thank you.", { voice_style: "", voice_id: "" }, "proud", controller.signal);
  expect(spoken).toHaveLength(1);
  expect(spoken[0]!.voice).toBeNull();
  controller.abort(); await promise;
  const aborted = browserSpeech("Thank you.", { voice_style: "", voice_id: "" }, "proud", controller.signal);
  await aborted; expect(spoken).toHaveLength(1);
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
    // A slow voice that keeps reporting word boundaries is alive, not stalled.
    for (let tick = 0; tick < 9; tick++) { await vi.advanceTimersByTimeAsync(1000); (spoken[index] as Utterance & { onboundary?: () => void }).onboundary?.(); }
    spoken[index]!.onend!(); await flush();
  }
  await promise; expect(cancel).not.toHaveBeenCalled(); expect(spoken).toHaveLength(3);
});
it("allows a real challenge after the live agent's silent preliminary line", async () => {
  await mount();
  const offer = { player_id: "ann", line: "Please wait.", counteroffer: "", audio_url: null, fact_ids: [] };
  useGame.setState({ phase: "CHALLENGE", counteroffers: { ann: offer } }); await flush();
  expect(spoken).toHaveLength(0);
  useGame.setState({ counteroffers: { ann: { ...offer, line: "Thank you.", counteroffer: "Please listen." } } }); await flush();
  expect(spoken.map(u => u.text)).toEqual(["Thank you."]);
});
it("does not start a stale line after a delayed TTS response", async () => {
  await mount();
  let release!: (value: Response) => void;
  vi.stubGlobal("window", { speechSynthesis: undefined });
  vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(resolve => { release = resolve; }));
  useGame.setState({ intro: { text: "Thank you.", audio_url: null, mood: "proud", analyst_line: "" } }); await flush();
  useGame.setState({ phase: "VERDICT" });
  release({ ok: true, json: async () => ({ audio_url: null }) } as Response); await flush();
  expect(spoken).toHaveLength(0);
  expect(duck).toHaveBeenLastCalledWith(false);
});

it("starts browser speech without waiting for an unresponsive TTS provider", async () => {
  await mount();
  vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
  useGame.setState({ intro: { text: "Thank you.", audio_url: null, mood: "proud", analyst_line: "" } });
  await flush();
  expect(spoken.map(u => u.text)).toEqual(["Thank you."]);
});
it("does not let optional persona loading block the first word", async () => {
  await mount();
  vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
  useGame.setState({ buildingId: "233953", intro: { text: "Thank you.", audio_url: null, mood: "proud", analyst_line: "" } });
  await flush();
  expect(spoken.map(u => u.text)).toEqual(["Thank you."]);
});
it("shows preliminary challenges silently so thinking cannot block the real offer", async () => {
  await mount();
  const offer = { player_id: "ann", line: "Please wait.", counteroffer: "", audio_url: null, fact_ids: [] };
  useGame.setState({ phase: "CHALLENGE", counteroffers: { ann: offer } }); await flush();
  expect(spoken).toHaveLength(0);
  useGame.setState({ counteroffers: { ann: { ...offer, line: "Thank you.", counteroffer: "Please listen." } } }); await flush();
  expect(spoken.map(u => u.text)).toEqual(["Thank you."]);
});
it("drops superseded queued offers for a player, keeping the latest complete line", async () => {
  await mount();
  const offer = { line: "Thank you.", counteroffer: "Please listen.", audio_url: null, fact_ids: [] };
  useGame.setState({ phase: "CHALLENGE", counteroffers: { ann: { ...offer, player_id: "ann" }, bo: { ...offer, player_id: "bo", line: "Old offer." } } }); await flush();
  useGame.setState({ counteroffers: { ...useGame.getState().counteroffers, bo: { ...offer, player_id: "bo", line: "New offer." } } }); await flush();
  spoken[0]!.onend!(); await flush(); spoken[1]!.onend!(); await flush();
  expect(spoken[2]!.text).toBe("New offer.");
});

it("falls back from a stalled prepared clip within the first-word budget", async () => {
  vi.useFakeTimers(); await mount();
  const pause = vi.fn();
  vi.stubGlobal("Audio", class {
    onended = null; onerror = null; onplaying = null;
    play = () => Promise.resolve(); pause = pause; removeAttribute = vi.fn();
  });
  useGame.setState({ intro: { text: "Thank you.", audio_url: "/media/prepared.mp3", mood: "proud", analyst_line: "" } }); await flush();
  expect(spoken).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(150);
  expect(spoken.map(u => u.text)).toEqual(["Thank you."]);
  expect(pause).toHaveBeenCalledTimes(1);
});

it("keeps the bounded voice-service fallback when browser speech is absent", async () => {
  await mount();
  vi.stubGlobal("window", { speechSynthesis: undefined });
  const play = vi.fn().mockResolvedValue(undefined);
  let clip: { onended: (() => void) | null; onplaying: (() => void) | null };
  vi.stubGlobal("Audio", class {
    onended = null; onplaying = null; onerror = null;
    play = play; pause = vi.fn(); removeAttribute = vi.fn();
    constructor() { clip = this; }
  });
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ audio_url: "/api/tts/cached.mp3" }) } as Response);
  useGame.setState({ intro: { text: "Thank you.", audio_url: null, mood: "proud", analyst_line: "" } }); await flush();
  expect(play).toHaveBeenCalledTimes(1);
  clip!.onplaying!(); clip!.onended!(); await flush();
  expect(spoken).toHaveLength(0);
  expect(duck).toHaveBeenLastCalledWith(false);
});
