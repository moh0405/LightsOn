import { useEffect, useState } from "react";
import { useTours } from "./tours";
import { TourFrame } from "./TourFrame";

export function WalkInside({ buildingId, modelId, close }: { buildingId: string; modelId: string | null; close: () => void }) {
  const { tours, loading } = useTours(buildingId);
  const [selected, setSelected] = useState<string | null>(modelId);
  useEffect(() => setSelected(modelId), [buildingId, modelId]);
  const tour = tours.find((t) => t.model_id === selected) ?? tours[0];
  return <section className="walk-inside" aria-label="Walk inside">
    <header className="tour-toolbar"><strong>Walk inside</strong><span>The round continues</span>
      <button autoFocus onClick={close}>Back to city · Esc / M</button></header>
    <div className="tour-tabs" role="tablist" aria-label="Interior tours">
      {tours.map((t, index) => <button key={t.model_id} role="tab" aria-selected={tour?.model_id === t.model_id}
        onClick={() => setSelected(t.model_id)}>{t.name ?? `Tour ${index + 1} · name unavailable`}</button>)}
    </div>
    <div className="walk-interior">{tour ? <TourFrame key={tour.model_id} tour={tour} /> : <p>{loading ? "Loading interior tours…" : "No interior tour available for this building."}</p>}</div>
  </section>;
}
