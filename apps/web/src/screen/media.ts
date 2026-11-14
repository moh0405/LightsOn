import { mediaPlan, type MediaBeat } from "./effects";
import { getDossier } from "../lib/buildings";

// Vite enumerates local public assets without making missing-image requests.
const assets = import.meta.glob("/public/media/**/*.{jpg,jpeg,png,webp,avif}", { query: "?url", import: "default" });
export async function loadMedia(id: string, onError: (message: string) => void): Promise<MediaBeat[]> {
  try {
    const dossier = await getDossier(id);
    const plan = mediaPlan((dossier as typeof dossier & { media?: unknown }).media, id);
    return plan.filter((beat) => beat.kind !== "aerial" || `/public${beat.src}` in assets);
  } catch {
    console.warn("Intro media unavailable; continuing with subtitles");
    onError("Building media unavailable. The round continues with subtitles.");
    return [];
  }
}
