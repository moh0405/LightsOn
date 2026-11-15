/** Browser recognition is the free path; MediaRecorder supports server STT. */
export interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
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
}
export function createRecorder(callbacks: Callbacks, environment?: RecorderEnvironment) {
  const browser = globalThis as typeof globalThis & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  const env = environment ?? {
    Recognition: browser.SpeechRecognition ?? browser.webkitSpeechRecognition,
    media: navigator.mediaDevices,
    Recorder: typeof MediaRecorder === "undefined" ? undefined : MediaRecorder,
  };
  let held = false, disposed = false;
  let recognition: Recognition | null = null;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const releaseTracks = () => { stream?.getTracks().forEach((track) => track.stop()); stream = null; };
  const idle = () => { clearTimeout(timer); callbacks.onListening?.(false); };
  const fail = () => { held = false; idle(); releaseTracks(); callbacks.onError("Voice unavailable. Type your pitch below."); };
  const stop = () => {
    held = false;
    idle();
    try { recognition?.stop(); } catch { /* Recognition already ended. */ }
    if (recorder?.state === "recording") recorder.stop();
    releaseTracks();
  };
  return {
    async start() {
      if (held || disposed) return;
      held = true;
      callbacks.onListening?.(true);
      timer = setTimeout(stop, 30_000);
      if (env.Recognition) {
        try {
          recognition = new env.Recognition();
          // Interim results show words while the player speaks. iOS Safari often never marks a
          // continuous result final, so the latest interim words count as heard too.
          recognition.lang = "en-US"; recognition.continuous = true; recognition.interimResults = true;
          let transcript = "";
          recognition.onresult = (event) => {
            if (disposed) return;
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const result = event.results[i];
              if (result?.isFinal) transcript += `${result[0].transcript} `;
              else if (result) interim += `${result[0].transcript} `;
            }
            const heard = `${transcript}${interim}`.replace(/\s+/g, " ").trim().slice(0, 280);
            if (heard) callbacks.onText(heard);
          };
          // Silence or our own stop is not a failure: the text box and typing stay as they are.
          recognition.onerror = (event) => { if (!disposed && event?.error !== "no-speech" && event?.error !== "aborted") fail(); };
          recognition.onend = () => { held = false; idle(); };
          recognition.start();
          return;
        } catch { fail(); return; }
      }
      try {
        if (!env.media) { fail(); return; }
        stream = await env.media.getUserMedia({ audio: true });
        if (!held || disposed) { releaseTracks(); return; }
        if (!env.Recorder) { fail(); return; }
        const parts: BlobPart[] = [];
        recorder = new env.Recorder(stream);
        recorder.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
        recorder.onerror = fail;
        recorder.onstop = () => {
          idle(); releaseTracks();
          if (!disposed && parts.length) callbacks.onAudio(new Blob(parts, { type: recorder?.mimeType || "audio/webm" }));
        };
        recorder.start();
      } catch { if (!disposed) fail(); }
    },
    stop,
    dispose() {
      disposed = true; held = false; clearTimeout(timer);
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
