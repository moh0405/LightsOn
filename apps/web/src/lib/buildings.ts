export type Status = "dark" | "partial" | "occupied" | "unknown";
export interface Building {
  id: string; name: string | null; lat: number | null; lng: number | null;
  stories: number | null; is_hero: boolean; dark_floors: number | null; dark_sqft: number | null;
}
export interface DossierFact {
  id?: string; key: string; value: unknown; say_as: string | null;
  source?: string; kind?: "verified" | "estimate";
}
/** Whole numbers in prepared text read as integers: "9,068.0 sqft" -> "9,068 sqft". */
export function wholeNumbers(text: string): string {
  return text.replace(/(\d)\.0+(?![\d.])/g, "$1");
}
export function factDescription(fact: DossierFact): string {
  return `${fact.kind === "estimate" ? "Estimate · " : ""}${fact.say_as == null ? "Source text unavailable" : wholeNumbers(fact.say_as)}`;
}
const SOURCES: [RegExp, string][] = [[/^costar/i, "CoStar"], [/^vexcel/i, "Vexcel"], [/^matterport/i, "Matterport"]];
export function sourceLabel(source: string | undefined): string {
  return SOURCES.find(([pattern]) => pattern.test(source ?? ""))?.[1] ?? "Source";
}
/** A readable name for a fact key; the fact id itself stays in the trace panel only. */
export function factLabel(key: string): string {
  const words = key.replace(/(_sqft|SquareFeet|InFeet)$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim().toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : "Fact";
}
/** Projector evidence line: source, then what the number is, then the dossier's say_as. */
export function evidenceLine(fact: DossierFact): string {
  const source = sourceLabel(fact.source);
  // CoStar say_as is a bare value ("9,068 sqft"); Vexcel and Matterport text is a full sentence.
  return source === "CoStar" ? `${source} · ${factLabel(fact.key)}: ${factDescription(fact)}` : `${source} · ${factDescription(fact)}`;
}
export interface Dossier {
  id: string; name: string | null; stories: number | null;
  floors: { number: number; available_sqft: number | null; source_status: Status }[] | null;
  facts: DossierFact[] | null;
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
