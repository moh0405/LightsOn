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
