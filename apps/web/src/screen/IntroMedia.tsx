import { useEffect, useState } from "react";
import { useGame } from "../lib/store";
import { INTRO_DIVE_MS, MEDIA_BEAT_MS, mediaAt, type MediaBeat } from "./effects";
import { loadMedia } from "./media";

/** Sandboxed external adapter: bounded wait, caption fallback and a visible toast. */
export function Matterport({ beat, onError }: { beat: MediaBeat; onError: (message: string) => void }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    setState("loading");
    const timer = setTimeout(() => {
      setState((s) => {
        if (s !== "loading") return s;
        console.warn("Matterport showcase timed out; using caption");
        onError("Interior tour unavailable. Showing the source caption.");
        return "failed";
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [beat.src, onError]);
  const fail = () => {
    console.warn("Matterport showcase blocked; using caption");
    setState("failed"); onError("Interior tour unavailable. Showing the source caption.");
  };
  return <figure className="intro-media" data-testid="matterport-still">
    <div className="tour-still"><span aria-hidden="true">◇</span><p>{beat.caption ?? "Interior tour caption unavailable"}</p></div>
    {state !== "failed" && <iframe title="Matterport interior tour" src={beat.src} sandbox="allow-scripts allow-same-origin allow-pointer-lock" referrerPolicy="no-referrer" onLoad={() => {
      // Browsers deliberately hide cross-origin iframe failures. Keep the
      // source caption visible underneath and offer an explicit still fallback.
      setState("ready");
    }} onError={fail} style={{ opacity: state === "ready" ? 1 : 0 }} />}
    <figcaption>Matterport · {beat.caption ?? "Caption unavailable"}{state !== "failed" && <button onClick={fail}>Show caption still</button>}</figcaption>
  </figure>;
}
export function IntroMedia({ onError }: { onError: (message: string) => void }) {
  const { buildingId, roundId, dataMode, phase } = useGame();
  const [beats, setBeats] = useState<MediaBeat[]>([]);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase !== "INTRO" || !buildingId) return;
    let active = true;
    const start = performance.now();
    setBeats([]); setElapsed(0);
    void loadMedia(buildingId, onError).then((plan) => { if (active) setBeats(plan); });
    const timer = setInterval(() => setElapsed(performance.now() - start), 50);
    return () => { active = false; clearInterval(timer); };
  }, [buildingId, roundId, dataMode, phase, onError]);
  if (phase !== "INTRO") return null;
  const beat = mediaAt(beats, elapsed);
  if (!beat) return elapsed < INTRO_DIVE_MS ? <div className="intro-approach" data-testid="intro-approach">Meet your next investor</div> : null;
  return beat.kind === "matterport" ? <Matterport key={beat.src} beat={beat} onError={onError} /> :
    <figure className="intro-media" key={beat.src} data-testid="intro-aerial" style={{ animationDuration: `${MEDIA_BEAT_MS}ms` }}>
      <img src={beat.src} alt={beat.caption ?? "Aerial view"} onError={() => { console.warn("Local aerial unavailable; skipping beat"); onError("Aerial image unavailable. Continuing the approach."); setBeats((list) => list.filter((b) => b.src !== beat.src)); }} />
      <figcaption>{beat.caption}{beat.captureDate ? ` · Captured ${beat.captureDate}` : ""}</figcaption>
    </figure>;
}
