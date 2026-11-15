import { useEffect, useState } from "react";
import { getDossier } from "../lib/buildings";
import { useGame } from "../lib/store";

export interface Tour { model_id: string; name: string | null; cover_url: string | null }
export const showcaseURL = (id: string) => `https://my.matterport.com/show/?m=${encodeURIComponent(id)}&play=1&qs=1&brand=0&help=0&hl=0`;
const cache = new Map<string, { at: number; promise: Promise<Tour[]> }>();

/** Fail quietly to dossier IDs. Metadata never delays mounting the public iframe. */
export function useTours(id: string | null) {
  const mode = useGame((s) => s.dataMode);
  const [result, setResult] = useState<{ key: string; tours: Tour[]; loading: boolean }>();
  const key = `${mode}:${id}`;
  useEffect(() => {
    let live = true;
    if (!id) return;
    void getDossier(id).then(async (dossier) => {
      const media = (dossier as typeof dossier & { media?: { matterport?: { model_id: string; caption?: string | null }[] } }).media;
      const fallback = (media?.matterport ?? []).filter((m) => /^[A-Za-z0-9]{11}$/.test(m.model_id))
        .map((m) => ({ model_id: m.model_id, name: m.caption ?? null, cover_url: null }));
      if (live) setResult({ key, tours: fallback, loading: false });
      if (!fallback.length) return;
      let entry = cache.get(key);
      if (!entry || Date.now() - entry.at > 300_000) {
        const promise = fetch(`/api/buildings/${encodeURIComponent(id)}/tours`, { signal: AbortSignal.timeout(8000) })
          .then(async (response): Promise<Tour[]> => {
            if (!response.ok) throw new Error("Tour metadata unavailable");
            const data: unknown = await response.json();
            if (!Array.isArray(data)) throw new Error("Invalid tour metadata");
            return data.filter((t): t is Tour => t !== null && typeof t === "object"
              && fallback.some((m) => m.model_id === t.model_id)
              && (t.name === null || typeof t.name === "string")
              && (t.cover_url === null || typeof t.cover_url === "string"));
          }).catch(() => { console.info("Tour metadata unavailable; using dossier model IDs"); return fallback; });
        entry = { at: Date.now(), promise }; cache.set(key, entry);
      }
      const tours = await entry.promise;
      if (live) setResult({ key, tours, loading: false });
    }).catch(() => { if (live) setResult({ key, tours: [], loading: false }); });
    return () => { live = false; };
  }, [id, key]);
  return result?.key === key ? result : { tours: [], loading: Boolean(id) };
}
