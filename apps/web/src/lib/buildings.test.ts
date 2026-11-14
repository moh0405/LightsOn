import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cachedDossier, getDossier, prefetchDossiers, setBuildingDataMode, type Building, type Dossier } from "./buildings";

const dossier = JSON.parse(readFileSync(new URL("../../../../server/fixtures/dossiers/233953.json", import.meta.url), "utf8")) as Dossier;
const building = { id: dossier.id } as Building;
beforeEach(() => { setBuildingDataMode("fixtures"); setBuildingDataMode("kit"); });
afterEach(() => vi.unstubAllGlobals());

it("prefetches once and exposes synchronous first-hover facts", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(dossier)));
  vi.stubGlobal("fetch", fetcher);
  await prefetchDossiers([building]);
  expect(cachedDossier(dossier.id)).toEqual(dossier);
  await getDossier(dossier.id);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("discards old-mode results even if they finish after a switch", async () => {
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
    .mockResolvedValue(new Response(JSON.stringify(dossier))));
  const old = getDossier(dossier.id);
  setBuildingDataMode("fixtures");
  expect(cachedDossier(dossier.id)).toBeNull();
  const fresh = await getDossier(dossier.id);
  resolveOld(new Response(JSON.stringify(dossier)));
  await old;
  expect(cachedDossier(dossier.id)).toBe(fresh);
});

it("retries a failed prefetch on hover", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(new Response(JSON.stringify(dossier))));
  await expect(prefetchDossiers([building])).rejects.toThrow("offline");
  expect(cachedDossier(dossier.id)).toBeNull();
  expect(await getDossier(dossier.id)).toEqual(dossier);
});
