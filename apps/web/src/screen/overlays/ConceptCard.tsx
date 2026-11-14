import { useEffect, useState } from "react";
import { useGame } from "../../lib/store";
import type { Category } from "../../lib/types";
import { lightUpDuration, type MediaBeat } from "../effects";
import { loadMedia } from "../media";
export const conceptLabels: Record<Category, string> = { housing: "Homes", food_retail: "Food and retail", entertainment: "Play space", community: "Community hub", culture: "Arts space", health: "Wellness space", work: "Shared workspace", wildcard: "Something unexpected" };
export function ConceptCard() {
  const { revival, phase } = useGame();
  const [ready, setReady] = useState(false);
  const [before, setBefore] = useState<MediaBeat | null>(null);
  useEffect(() => {
    setReady(false); setBefore(null);
    if (!revival) return;
    let active = true;
    const timer = setTimeout(() => setReady(true), Math.max(0, lightUpDuration(revival.floors) - (Date.now() - revival.at)));
    void loadMedia(revival.building_id, () => {}).then((beats) => { if (active) setBefore(beats.find((b) => b.kind === "aerial") ?? beats.find((b) => b.kind === "matterport") ?? null); });
    return () => { active = false; clearTimeout(timer); };
  }, [revival]);
  if (!revival || !ready || phase !== "REVIVED") return null;
  return <section className="concept-card" data-testid="concept-card">
    <h2>A new chapter</h2>
    <div className="concept-pair">
      <figure>{before?.kind === "aerial" ? <img src={before.src} alt={before.caption ?? "Source aerial"} /> : <div className="concept-before">{before?.caption ?? "Source image unavailable"}</div>}<figcaption>Before · Listed available floors</figcaption></figure>
      <figure><img src={`/concepts/${revival.category}.svg`} alt={`${conceptLabels[revival.category]} game illustration`} /><figcaption>After · {conceptLabels[revival.category]}</figcaption></figure>
    </div>
    <p>Game concept, not a real renovation</p>
  </section>;
}
