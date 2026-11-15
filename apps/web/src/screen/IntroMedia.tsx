import { useEffect, useState } from "react";
import { useGame } from "../lib/store";
import { INTRO_DIVE_MS, MEDIA_BEAT_MS, mediaAt, type MediaBeat } from "./effects";
import { loadMedia } from "./media";
import { useTours } from "./tours";
import { TourFrame } from "./TourFrame";

// The client hears INTRO up to ~0.5 s after the server starts its 8 s timer;
// a 1 s lead-in keeps the preloaded tour on screen for at least six seconds.
export const INTRO_TOUR_START_MS = 1000;
export const INTRO_TOUR_DURATION_MS = 7000;

export function IntroMedia({ onError }: { onError: (message: string) => void }) {
  const { buildingId, roundId, dataMode, phase } = useGame();
  const { tours } = useTours(buildingId);
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
  const tour = tours[0];
  const showTour = elapsed >= INTRO_TOUR_START_MS && elapsed < INTRO_TOUR_START_MS + INTRO_TOUR_DURATION_MS;
  const aerial = tour ? (elapsed < INTRO_TOUR_START_MS ? beats.find((b) => b.kind === "aerial") : null) : beat?.kind === "aerial" ? beat : null;
  // Fixed child order keeps the preloading iframe mounted when its beat starts.
  return <>
    {tour && visible && <div className="intro-media" data-testid="matterport-still" aria-hidden={!showTour} style={{ visibility: showTour ? "visible" : "hidden" }}><TourFrame key={tour.model_id} tour={tour} /></div>}
    {!beat && elapsed < INTRO_DIVE_MS ? <div className="intro-approach" data-testid="intro-approach">Meet your next investor</div> : null}
    {aerial && <figure className="intro-media" key={aerial.src} data-testid="intro-aerial" style={{ animationDuration: `${MEDIA_BEAT_MS}ms` }}>
      <img src={aerial.src} alt={aerial.caption ?? "Aerial view"} onError={() => { console.warn("Local aerial unavailable; skipping beat"); onError("Aerial image unavailable. Continuing the approach."); setBeats((list) => list.filter((b) => b.src !== aerial.src)); }} />
      <figcaption>{aerial.caption}{aerial.captureDate ? ` · Captured ${aerial.captureDate}` : ""}</figcaption>
    </figure>}
  </>;
}
