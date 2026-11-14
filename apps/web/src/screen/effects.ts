export const INTRO_DIVE_MS = 2500;
export const MEDIA_BEAT_MS = 1250;
export const FLOOR_STAGGER_MS = 60;
export const FLOOR_FADE_MS = 600;
export const FLASH_MS = 200;
export interface MediaBeat { kind: "aerial" | "matterport"; src: string; caption: string | null; captureDate: string | null }
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
/** Read only the dossier's media allowlist; never render arbitrary fields or URLs. */
export function mediaPlan(value: unknown, id: string): MediaBeat[] {
  const media = record(value), aerial = record(media.aerial);
  const result: MediaBeat[] = [];
  const date = text(aerial.capture_date);
  const image = (value: unknown, label: string) => {
    const entry = record(value), src = text(value) ?? text(entry.url);
    if (!src || !src.startsWith(`/media/${encodeURIComponent(id)}/`) || src.includes("..") || !/\.(jpe?g|png|webp|avif)$/i.test(src)) return;
    result.push({ kind: "aerial", src, caption: `Vexcel ${label} · Estimate`, captureDate: text(entry.capture_date) ?? date });
  };
  image(aerial.ortho, "aerial");
  if (Array.isArray(aerial.obliques)) aerial.obliques.forEach((v) => image(v, "oblique"));
  if (Array.isArray(media.matterport)) {
    const tour = media.matterport.map(record).find((v) => typeof v.model_id === "string" && /^[a-zA-Z0-9]{11}$/.test(v.model_id));
    if (tour) result.push({ kind: "matterport", src: `https://my.matterport.com/show/?m=${String(tour.model_id)}`, caption: text(tour.caption), captureDate: null });
  }
  return result;
}
/** Reserve the interior beat within the server's eight-second INTRO. */
export function boundMediaPlan(beats: MediaBeat[]): MediaBeat[] {
  return [...beats.filter((b) => b.kind === "aerial").slice(0, 3), ...beats.filter((b) => b.kind === "matterport").slice(0, 1)];
}
export function mediaAt(beats: MediaBeat[], elapsed: number): MediaBeat | null {
  return elapsed < INTRO_DIVE_MS ? null : beats[Math.floor((elapsed - INTRO_DIVE_MS) / MEDIA_BEAT_MS)] ?? null;
}
export function firstFloorAt(revivedAt: number): number {
  return revivedAt + FLASH_MS;
}
export function lightUpDuration(floors: number[]): number {
  return floors.length ? FLASH_MS + FLOOR_FADE_MS + (floors.length - 1) * FLOOR_STAGGER_MS : 0;
}
