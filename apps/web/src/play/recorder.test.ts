import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecorder, dictationSupported, submitAudio, type Recognition } from "./recorder";

describe("hold to talk fallbacks", () => {
  it("keeps typing available when the microphone is denied", async () => {
    const error = vi.fn();
    const recorder = createRecorder({ onText: vi.fn(), onAudio: vi.fn(), onError: error }, {
      media: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    await recorder.start();
    recorder.stop();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Type"));
  });
  it("uses browser recognition without uploading and aborts on disposal", async () => {
    const text = vi.fn();
    let instance: FakeRecognition;
    class FakeRecognition implements Recognition {
      lang = ""; interimResults = false; continuous = false;
      onresult: Recognition["onresult"] = null;
      onerror: Recognition["onerror"] = null;
      onend: Recognition["onend"] = null;
      start = vi.fn(); stop = vi.fn(); abort = vi.fn();
      constructor() { instance = this; }
    }
    const audio = vi.fn();
    const recorder = createRecorder({ onText: text, onAudio: audio, onError: vi.fn() }, { Recognition: FakeRecognition });
    await recorder.start();
    instance!.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "A community space." } }] });
    recorder.stop();
    expect(text).toHaveBeenCalledWith("A community space.");
    expect(audio).not.toHaveBeenCalled();
    recorder.dispose();
    expect(instance!.abort).toHaveBeenCalled();
  });
  it("shows interim words, keeps them when nothing is marked final, and ignores silence", async () => {
    const text = vi.fn(), error = vi.fn();
    let instance: FakeRecognition;
    class FakeRecognition implements Recognition {
      lang = ""; interimResults = false; continuous = false;
      onresult: Recognition["onresult"] = null;
      onerror: Recognition["onerror"] = null;
      onend: Recognition["onend"] = null;
      start = vi.fn(); stop = vi.fn(); abort = vi.fn();
      constructor() { instance = this; }
    }
    const recorder = createRecorder({ onText: text, onAudio: vi.fn(), onError: error }, { Recognition: FakeRecognition });
    await recorder.start();
    expect(instance!.interimResults).toBe(true);
    instance!.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "A late night" } }] });
    instance!.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "A late night board game cafe" } }] });
    expect(text).toHaveBeenLastCalledWith("A late night board game cafe");
    instance!.onerror?.({ error: "no-speech" });
    expect(error).not.toHaveBeenCalled();
    instance!.onerror?.({ error: "not-allowed" });
    expect(error).toHaveBeenCalledWith("Voice unavailable. Type your pitch below.");
    recorder.dispose();
  });

  it("does not record after release while the permission dialog was pending", async () => {
    let resolve!: (stream: MediaStream) => void;
    const track = { stop: vi.fn() };
    const recorder = createRecorder({ onText: vi.fn(), onAudio: vi.fn(), onError: vi.fn() }, {
      media: { getUserMedia: () => new Promise((r) => { resolve = r; }) },
    });
    const pending = recorder.start();
    recorder.stop();
    resolve({ getTracks: () => [track] } as unknown as MediaStream);
    await pending;
    expect(track.stop).toHaveBeenCalled();
  });
});

describe("server speech fallback text", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const unavailable = () => vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
  it("suggests browser dictation only when the phone supports it", async () => {
    unavailable();
    await expect(submitAudio("ROOM", "p1", "PITCH", "r1", new Blob(["a"]), false)).rejects.toThrow("Server speech unavailable. Type your pitch.");
    await expect(submitAudio("ROOM", "p1", "PITCH", "r1", new Blob(["a"]), true)).rejects.toThrow("Try browser dictation or type your pitch.");
  });
  it("detects dictation from the browser's speech recognition API", () => {
    expect(dictationSupported({})).toBe(false);
    expect(dictationSupported({ webkitSpeechRecognition: class {} })).toBe(true);
  });
});

describe("microphone session lifecycle", () => {
  function setup() {
    const instances: FakeRecognition[] = [];
    class FakeRecognition implements Recognition {
      lang = ""; continuous = false; interimResults = false;
      onstart: Recognition["onstart"] = null;
      onresult: Recognition["onresult"] = null;
      onerror: Recognition["onerror"] = null;
      onend: Recognition["onend"] = null;
      start = vi.fn(); stop = vi.fn(); abort = vi.fn();
      constructor() { instances.push(this); }
    }
    const callbacks = { onText: vi.fn(), onAudio: vi.fn(), onError: vi.fn(), onListening: vi.fn(), onReady: vi.fn() };
    return { instances, callbacks, recorder: createRecorder(callbacks, { Recognition: FakeRecognition }) };
  }

  it("shows mic readiness only when recognition starts and stops once on repeated releases", async () => {
    const { recorder, instances, callbacks } = setup();
    await recorder.start();
    expect(callbacks.onListening).toHaveBeenLastCalledWith(true);
    expect(callbacks.onReady).not.toHaveBeenCalled();
    instances[0]!.onstart?.();
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    recorder.stop(); recorder.stop();
    expect(instances[0]!.stop).toHaveBeenCalledTimes(1);
    recorder.dispose();
  });

  it("ignores old results and end events after a new press without stopping the new mic", async () => {
    const { recorder, instances, callbacks } = setup();
    await recorder.start(); recorder.stop(); await recorder.start();
    instances[0]!.onend?.();
    instances[0]!.onerror?.({ error: "not-allowed" });
    instances[0]!.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "old pitch" } }] });
    expect(callbacks.onListening).toHaveBeenLastCalledWith(true);
    expect(callbacks.onText).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    recorder.stop();
    expect(instances[1]!.stop).toHaveBeenCalledTimes(1);
    recorder.dispose();
  });

  it("replaces interim text with the full result list without duplicating repeated final results", async () => {
    const { recorder, instances, callbacks } = setup();
    await recorder.start();
    const first = { isFinal: true, 0: { transcript: "A cafe" } };
    instances[0]!.onresult?.({ resultIndex: 0, results: [first, { isFinal: false, 0: { transcript: "with games" } }] });
    instances[0]!.onresult?.({ resultIndex: 0, results: [first, { isFinal: true, 0: { transcript: "with games" } }] });
    expect(callbacks.onText).toHaveBeenLastCalledWith("A cafe with games");
    recorder.dispose();
  });

  it("cancels late dictation when the player switches to typing", async () => {
    const { recorder, instances, callbacks } = setup();
    await recorder.start();
    recorder.cancel();
    instances[0]!.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "late words" } }] });
    expect(callbacks.onText).not.toHaveBeenCalled();
    expect(callbacks.onListening).toHaveBeenLastCalledWith(false);
    await recorder.start();
    expect(instances).toHaveLength(2);
    recorder.dispose();
  });

  it("releases a stale permission response without interrupting a newer microphone request", async () => {
    const requests: ((stream: MediaStream) => void)[] = [];
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    const recordings: FakeRecorder[] = [];
    class FakeRecorder {
      state = "inactive";
      start = vi.fn(() => { this.state = "recording"; });
      stop = vi.fn(() => { this.state = "inactive"; });
      constructor() { recordings.push(this); }
    }
    const recorder = createRecorder({ onText: vi.fn(), onAudio: vi.fn(), onError: vi.fn() }, {
      media: { getUserMedia: () => new Promise((resolve) => requests.push(resolve)) },
      Recorder: FakeRecorder as unknown as typeof MediaRecorder,
    });
    const first = recorder.start(); recorder.stop(); const second = recorder.start();
    requests[1]!({ getTracks: () => [tracks[1]] } as unknown as MediaStream);
    await second;
    requests[0]!({ getTracks: () => [tracks[0]] } as unknown as MediaStream);
    await first;
    expect(tracks[0]!.stop).toHaveBeenCalled();
    expect(tracks[1]!.stop).not.toHaveBeenCalled();
    expect(recordings).toHaveLength(1);
    recorder.dispose();
    expect(tracks[1]!.stop).toHaveBeenCalled();
  });
});
