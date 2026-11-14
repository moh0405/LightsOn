import { useEffect, useState } from "react";
import { cachedDossier, getDossier, type Dossier } from "../../lib/buildings";

export function HoverCard({ id, color, onError }: { id: string; color: string; onError: () => void }) {
  const [data, setData] = useState<Dossier | null>(() => cachedDossier(id));
  useEffect(() => {
    let active = true;
    setData(cachedDossier(id));
    void getDossier(id).then((d) => { if (active) setData(d); }).catch(() => { if (active) onError(); });
    return () => { active = false; };
  }, [id, onError]);
  const floors = data?.floors;
  const available = floors?.every((f) => f.available_sqft !== null)
    ? floors.reduce((sum, f) => sum + (f.available_sqft ?? 0), 0) : null;
  const spoken = data?.facts?.find((f) => f.key === "available_sqft")?.say_as;
  return <article data-testid="hover-card" style={{ border: `2px solid ${color}`, borderRadius: 12, padding: 16, background: "#10131cef", fontSize: 28 }}>
    <strong>{data?.name ?? "Building"}</strong>
    {data?.stories != null && <div>{data.stories} stories</div>}
    {floors && <div>{floors.filter((f) => f.source_status === "dark").length} dark floors</div>}
    {(spoken || available !== null) && <div>{spoken ?? `${available?.toLocaleString()} sq ft available`}</div>}
    {!data && <div>Loading facts…</div>}
  </article>;
}
