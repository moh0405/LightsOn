import { useEffect, useState } from "react";
import { factDescription, cachedDossier, availableSpaceLine, getDossier, type Dossier } from "../../lib/buildings";

export function HoverCard({ id, floor, color, onError }: { id: string; floor?: number | null; color: string; onError: () => void }) {
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
  const space = availableSpaceLine(data?.facts?.find((f) => f.key === "available_sqft")?.say_as, available);
  return <article data-testid="hover-card" className="hover-card" style={{ border: `2px solid ${color}`, borderRadius: 12, padding: 16, background: "#10131cef", fontSize: 28, boxShadow: `0 8px 36px #0006, 0 0 24px ${color}25` }}>
    <strong>{data?.name ?? "Building"}</strong>
    {floor != null && <div style={{ color }}>Floor {floor} · under your beam</div>}
    {data?.stories != null && <div>{data.stories} stories</div>}
    {floors && <div>{floors.filter((f) => f.source_status === "dark").length} dark floors</div>}
    {space && <div>{space}</div>}
    {data?.facts?.filter((fact) => fact.source === "vexcel+vision").map((fact) => <div key={fact.id}>{factDescription(fact)}</div>)}
    {!data && <div>Loading facts…</div>}
    <div className="wake-affordance" style={{ borderColor: color }}>Wake on your phone ↗</div>
  </article>;
}
