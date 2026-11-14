import { useEffect, useRef, useState } from "react";
import { useGame } from "../lib/store";
import { INTRO_DIVE_MS, MEDIA_BEAT_MS, mediaAt, type MediaBeat } from "./effects";
import { loadMedia } from "./media";

/** Realistic venue Wi-Fi window for the showcase, counted from the start of INTRO. */
export const MATTERPORT_LOAD_MS = 5000;

/** Sandboxed external adapter. Mounted (hidden) as soon as INTRO starts so the
 * showcase loads during the dive; shown only during its beat. Slowness is an
 * expected fallback: the source caption stays, with a log and no toast. */
export function Matterport({ beat, visible }: { beat: MediaBeat; visible: boolean }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const loaded = useRef(false);
  useEffect(() => {
    loaded.current = false; setState("loading");
    const timer = setTimeout(() => {
      if (!loaded.current) { console.info("Matterport showcase still loading; using caption"); setState("failed"); }
    }, MATTERPORT_LOAD_MS);
    return () => clearTimeout(timer);
  }, [beat.src]);
  const fail = () => { console.info("Matterport showcase unavailable; using caption"); setState("failed"); };
  return <figure className="intro-media" data-testid={visible ? "matterport-still" : undefined} aria-hidden={!visible} style={visible ? undefined : { visibility: "hidden", animation: "none" }}>
    <div className="tour-still"><span aria-hidden="true">◇</span><p>{beat.caption ?? "Interior tour caption unavailable"}</p></div>
    {state !== "failed" && <iframe title="Matterport interior tour" src={beat.src} sandbox="allow-scripts allow-same-origin allow-pointer-lock" referrerPolicy="no-referrer" onLoad={() => {
      // Browsers deliberately hide cross-origin iframe failures. Keep the
      // source caption visible underneath and offer an explicit still fallback.
      loaded.current = true; setState("ready");
    }} onError={fail} style={{ opacity: state === "ready" ? 1 : 0 }} />}
    <figcaption>Matterport · {beat.caption ?? "Caption unavailable"}{state !== "failed" && <button onClick={fail}>Show caption still</button>}</figcaption>
  </figure>;
}
export function IntroMedia({ onError }: { onError: (message: string) => void }) {
  const { buildingId, roundId, dataMode, phase } = useGame();
  const [beats, setBeats] = useState<MediaBeat[]>([]);
  const [elapsed, setElapsed] = useState(0);
  // Only embed the third-party tour while the projector page is actually shown.
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
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
  const tour = beats.find((b) => b.kind === "matterport");
  const aerial = beat?.kind === "aerial" ? beat : null;
  // Fixed child order keeps the preloading iframe mounted when its beat starts.
  return <>
    {tour && visible && <Matterport key={tour.src} beat={tour} visible={beat?.kind === "matterport"} />}
    {!beat && elapsed < INTRO_DIVE_MS ? <div className="intro-approach" data-testid="intro-approach">Meet your next investor</div> : null}
    {aerial && <figure className="intro-media" key={aerial.src} data-testid="intro-aerial" style={{ animationDuration: `${MEDIA_BEAT_MS}ms` }}>
      <img src={aerial.src} alt={aerial.caption ?? "Aerial view"} onError={() => { console.warn("Local aerial unavailable; skipping beat"); onError("Aerial image unavailable. Continuing the approach."); setBeats((list) => list.filter((b) => b.src !== aerial.src)); }} />
      <figcaption>{aerial.caption}{aerial.captureDate ? ` · Captured ${aerial.captureDate}` : ""}</figcaption>
    </figure>}
  </>;
}
