/** Browser recognition is the free path; MediaRecorder supports server STT. */
export interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onstart?: (() => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionConstructor = new () => Recognition;
interface RecorderEnvironment {
  Recognition?: RecognitionConstructor;
  media?: Pick<MediaDevices, "getUserMedia">;
  Recorder?: typeof MediaRecorder;
}
interface Callbacks {
  onText(text: string): void;
  onAudio(blob: Blob): void;
  onError(message: string): void;
  onListening?(listening: boolean): void;
  onReady?(): void;
}
export function createRecorder(callbacks: Callbacks, environment?: RecorderEnvironment) {
  const browser = globalThis as typeof globalThis & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  const env = environment ?? {
    Recognition: browser.SpeechRecognition ?? browser.webkitSpeechRecognition,
    media: navigator.mediaDevices,
    Recorder: typeof MediaRecorder === "undefined" ? undefined : MediaRecorder,
  };
  let held = false, disposed = false;
  let generation = 0;
  let recognition: Recognition | null = null;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const releaseTracks = () => { stream?.getTracks().forEach((track) => track.stop()); stream = null; };
  const idle = () => { clearTimeout(timer); callbacks.onListening?.(false); };
  const fail = () => { held = false; idle(); releaseTracks(); callbacks.onError("Voice unavailable. Type your pitch below."); };
  const stop = () => {
    if (!held) return;
    held = false;
    idle();
    try { recognition?.stop(); } catch { /* Recognition already ended. */ }
    if (recorder?.state === "recording") recorder.stop();
    releaseTracks();
  };
  return {
    async start() {
      if (held || disposed) return;
      const session = ++generation;
      const current = () => !disposed && session === generation;
      // A previous session may still deliver final results/end after release.
      try { recognition?.abort(); } catch { /* Already ended. */ }
      recognition = null;
      held = true;
      callbacks.onListening?.(true);
      timer = setTimeout(stop, 30_000);
      if (env.Recognition) {
        try {
          recognition = new env.Recognition();
          // Interim results show words while the player speaks. iOS Safari often never marks a
          // continuous result final, so the latest interim words count as heard too.
          recognition.lang = "en-US"; recognition.continuous = true; recognition.interimResults = true;
          recognition.onstart = () => { if (current() && held) callbacks.onReady?.(); };
          recognition.onresult = (event) => {
            if (!current()) return;
            let transcript = "";
            for (let i = 0; i < event.results.length; i++) {
              const result = event.results[i];
              if (result) transcript += `${result[0].transcript} `;
            }
            const heard = transcript.replace(/\s+/g, " ").trim().slice(0, 280);
            if (heard) callbacks.onText(heard);
          };
          // Silence or our own stop is not a failure: the text box and typing stay as they are.
          recognition.onerror = (event) => { if (current() && event?.error !== "no-speech" && event?.error !== "aborted") fail(); };
          recognition.onend = () => { if (current()) { held = false; idle(); } };
          recognition.start();
          return;
        } catch { fail(); return; }
      }
      try {
        if (!env.media) { fail(); return; }
        const acquired = await env.media.getUserMedia({ audio: true });
        if (!held || !current()) { acquired.getTracks().forEach((track) => track.stop()); return; }
        stream = acquired;
        if (!env.Recorder) { fail(); return; }
        const parts: BlobPart[] = [];
        const recording = new env.Recorder(stream);
        recorder = recording;
        recording.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
        recording.onerror = () => { if (current()) fail(); };
        recording.onstop = () => {
          acquired.getTracks().forEach((track) => track.stop());
          if (!current()) return;
          idle();
          if (parts.length) callbacks.onAudio(new Blob(parts, { type: recording.mimeType || "audio/webm" }));
        };
        recording.start();
        callbacks.onReady?.();
      } catch { if (current()) fail(); }
    },
    stop,
    cancel() {
      generation++; held = false; idle();
      try { recognition?.abort(); } catch { /* Optional API. */ }
      if (recorder?.state === "recording") recorder.stop();
      releaseTracks();
    },
    dispose() {
      disposed = true; generation++; held = false; clearTimeout(timer);
      try { recognition?.abort(); } catch { /* Optional API. */ }
      if (recorder?.state === "recording") recorder.stop();
      releaseTracks();
    },
  };
}

/** True when the phone has a built-in speech recognition (dictation) API. */
export function dictationSupported(scope: object = globalThis): boolean {
  return "SpeechRecognition" in scope || "webkitSpeechRecognition" in scope;
}

export async function submitAudio(room: string, playerId: string, phase: "PITCH" | "NEGOTIATE", roundId: string | null, audio: Blob,
  dictation = dictationSupported()): Promise<string> {
  const body = new FormData();
  body.set("audio", audio, "pitch"); body.set("player_id", playerId); body.set("phase", phase);
  if (roundId) body.set("round_id", roundId);
  const response = await fetch(`/api/rooms/${encodeURIComponent(room)}/pitch_audio`, { method: "POST", body, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(response.status === 503
    ? (dictation ? "Server speech unavailable. Try browser dictation or type your pitch." : "Server speech unavailable. Type your pitch.")
    : "Voice pitch could not be sent. Type your pitch and try again.");
  const result = await response.json() as { text: string };
  return result.text;
}
