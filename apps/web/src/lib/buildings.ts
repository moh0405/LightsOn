export type Status = "dark" | "partial" | "occupied" | "unknown";
export interface Building {
  id: string; name: string | null; lat: number | null; lng: number | null;
  stories: number | null; is_hero: boolean; dark_floors: number | null; dark_sqft: number | null;
}
export interface Dossier {
  id: string; name: string | null; stories: number | null;
  floors: { number: number; available_sqft: number | null; source_status: Status }[] | null;
  facts: { id?: string; key: string; value: unknown; say_as: string | null }[] | null;
}
/** Local data requests time out; callers own their visible fallback. */
export async function getData<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Data unavailable: ${url} (${response.status})`);
  const data: unknown = await response.json();
  if (data === null || typeof data !== "object") throw new Error(`Invalid data: ${url}`);
  return data as T;
}
const dossiers = new Map<string, Promise<Dossier>>();
const cachedDossiers = new Map<string, Dossier>();
let dataMode = "kit";
/** Invalidate both resolved and in-flight facts before rendering a new mode. */
export function setBuildingDataMode(mode: string): void {
  if (mode === dataMode) return;
  dataMode = mode;
  dossiers.clear();
  cachedDossiers.clear();
}
export function cachedDossier(id: string): Dossier | null {
  return cachedDossiers.get(id) ?? null;
}
export async function prefetchDossiers(buildings: Building[]): Promise<void> {
  await Promise.all(buildings.map((b) => getDossier(b.id)));
}
export function getDossier(id: string): Promise<Dossier> {
  let pending = dossiers.get(id);
  if (!pending) {
    pending = getData<Dossier>(`/api/buildings/${encodeURIComponent(id)}`).then((dossier) => {
      if (dossiers.get(id) === pending) cachedDossiers.set(id, dossier);
      return dossier;
    }).catch((error: unknown) => {
      if (dossiers.get(id) === pending) dossiers.delete(id); // Retry failed prefetches.
      throw error;
    });
    dossiers.set(id, pending);
  }
  return pending;
}
