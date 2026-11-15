import { useEffect, useRef, useState } from "react";
import { showcaseURL, type Tour } from "./tours";

export const MATTERPORT_LOAD_MS = 8000;

/** Public Showcase, no SDK credentials or microphone/camera permissions. */
export function TourFrame({ tour }: { tour: Tour }) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const loaded = useRef(false);
  useEffect(() => {
    loaded.current = false;
    setStatus("loading");
    const timer = setTimeout(() => {
      if (!loaded.current) { console.info("Matterport tour unavailable; showing cover"); setStatus("failed"); }
    }, MATTERPORT_LOAD_MS);
    return () => clearTimeout(timer);
  }, [tour.model_id]);
  return <figure className="tour-frame" data-status={status}>
    {tour.cover_url && <img className="tour-cover" src={tour.cover_url} alt={tour.name ?? "Interior tour cover"} onError={(e) => { e.currentTarget.hidden = true; }} />}
    {status !== "failed" && <iframe title="Matterport interior tour" src={showcaseURL(tour.model_id)}
      allow="fullscreen; xr-spatial-tracking" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => { loaded.current = true; setStatus("ready"); }}
      onError={() => { console.info("Matterport tour unavailable; showing cover"); setStatus("failed"); }} />}
    <figcaption>Matterport · {tour.name ?? "Tour name unavailable"}{status === "failed" ? " · Tour unavailable" : status === "loading" ? " · Loading tour…" : ""}</figcaption>
  </figure>;
}
