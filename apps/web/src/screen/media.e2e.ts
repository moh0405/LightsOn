import { expect, test, type BrowserContext, type WebSocketRoute } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mockSkyline } from "../../e2e/skyline-data";
import type { RoomStateMsg, ServerMessage } from "../lib/protocol";
import type { Phase } from "../lib/types";
declare global { interface Window { firstMediaLight: number } }
const dossier = JSON.parse(readFileSync(new URL("../../../../server/fixtures/dossiers/233953.json", import.meta.url), "utf8")) as { media: unknown };
const persona = JSON.parse(readFileSync(new URL("../../../../server/fixtures/personas/233953.json", import.meta.url), "utf8")) as { intro_line: string };

async function setup(context: BrowserContext, mode: string, tour: "ready" | "timeout" = "ready") {
  let socket: WebSocketRoute | undefined;
  await mockSkyline(context);
  await context.route("**/api/buildings/233953", (r) => r.fulfill({ json: dossier }));
  await context.route("https://my.matterport.com/**", (r) => tour === "timeout" ? new Promise<void>(() => {}) : r.fulfill({ contentType: "text/html", body: "<html><body style='background:#202e45;color:#f2c46d;font:40px sans-serif'>Matterport test adapter</body></html>" }));
  await context.route("**/api/rooms", (r) => r.fulfill({ json: { room: "MEDI", join_url: "http://localhost/play?room=MEDI", qr_svg: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="white"/></svg>' } }));
  await context.routeWebSocket("**/ws/MEDI?*", (ws) => {
    socket = ws;
    ws.send(JSON.stringify({ type: "room_state", room: "MEDI", phase: "EXPLORE", round_id: null, building_id: null, ends_at: null, target_floors: [], data_mode: mode, data_mode_scope: "process", hero_building_ids: ["233953"], players: [], city: { buildings_revived: 0, sqft_reimagined: 0, song_layers: 0, needs: { housing: 40, food_retail: 30, entertainment: 15, community: 35 }, most_needed: "entertainment" } } satisfies RoomStateMsg));
  });
  return {
    emit: (message: ServerMessage) => socket!.send(JSON.stringify(message)),
    phase: (phase: Phase) => socket!.send(JSON.stringify({ type: "phase_changed", phase, round_id: "MEDIA1", ends_at: null } satisfies ServerMessage)),
  };
}
for (const mode of ["kit", "fixtures"]) test(`media approach, instant light-up, concept and 0–4 player layout (${mode})`, async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  try {
    const server = await setup(context, mode);
    const page = await context.newPage();
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseURL}/screen`);
    await expect(page.getByTestId("field")).toHaveAttribute("data-facts-ready", "true");
    for (let count = 0; count <= 4; count++) {
      if (count) server.emit({ type: "player_joined", player: { id: `p${count}`, nickname: "ABCDEFGHIJKLMNOP", color: "#00ccff", connected: true } });
      await expect(page.getByRole("heading", { name: `Players (${count}/4)` })).toBeVisible();
      expect(await page.evaluate(() => ({ height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth }))).toEqual({ height: 1080, width: 1920 });
      const last = page.getByTestId("city-meter").getByText("Most needed:");
      expect((await last.boundingBox())!.y + (await last.boundingBox())!.height).toBeLessThanOrEqual(1080);
    }
    server.emit({ type: "round_started", round_id: "MEDIA1", building_id: "233953", target_floors: [6, 7, 8] });
    server.phase("INTRO");
    server.emit({ type: "building_intro", text: persona.intro_line, audio_url: null, mood: "hopeful", analyst_line: null });
    await expect(page.getByTestId("intro-approach")).toBeVisible();
    await expect(page.getByTestId("subtitles")).toContainText(persona.intro_line);
    await page.screenshot({ animations: "disabled", path: info.outputPath(`INTRO-${mode}.png`) });
    await expect(page.getByTitle("Matterport interior tour")).toBeVisible({ timeout: 6000 });
    // Source captions stay honest when the kit has no caption.
    await expect(page.getByTestId("matterport-still")).toContainText("Caption unavailable");
    await page.screenshot({ animations: "disabled", path: info.outputPath(`INTRO-tour-${mode}.png`) });
    server.phase("PITCH");
    await expect(page.getByTitle("Matterport interior tour")).toHaveCount(0);
    await expect(page.getByTestId("subtitles")).toBeVisible();
    server.phase("POWER_UP");
    await page.evaluate(() => {
      const map = window.__lightsOnMap!;
      const original = map.setPaintProperty;
      Object.assign(window, { firstMediaLight: 0 });
      Object.defineProperty(map, "setPaintProperty", { value: (...args: [string, string, unknown]) => {
        if (args[1] === "fill-extrusion-color" && JSON.stringify(args[2]).includes("#00ccff")) {
          const target = window;
          if (!target.firstMediaLight) target.firstMediaLight = Date.now();
        }
        return Reflect.apply(original, map, args);
      } });
    });
    const at = Date.now();
    server.emit({ type: "building_revived", building_id: "233953", floors: [8, 6, 7], color: "#00ccff", category: "entertainment", sqft: 94509, auto_completed: false });
    server.emit({ type: "neighborhood_updated", needs: { housing: 40, food_retail: 30, entertainment: 45, community: 35 }, most_needed: "food_retail" });
    server.phase("REVIVED");
    await expect.poll(() => page.evaluate(() => window.firstMediaLight)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.firstMediaLight) - at).toBeLessThan(300);
    await expect(page.getByTestId("concept-card")).toContainText("Game concept, not a real renovation");
    await expect(page.getByRole("meter", { name: "Entertainment", exact: true })).toHaveAttribute("value", "45");
    await expect(page.getByTestId("city-meter")).toContainText("94,509");
    await page.screenshot({ animations: "disabled", path: info.outputPath(`REVIVED-${mode}.png`) });
    server.emit({ type: "error", code: "media_test", message: "Media test fallback notice" });
    await expect(page.getByRole("alert")).toContainText("Media test fallback notice");
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("Matterport timeout falls back to a caption and never holds the phase; auto-completion is softer", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  try {
    const server = await setup(context, "fixtures", "timeout");
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseURL}/screen`);
    await expect(page.getByTestId("field")).toHaveAttribute("data-facts-ready", "true");
    server.emit({ type: "round_started", round_id: "MEDIA1", building_id: "233953", target_floors: [6, 7, 8] }); server.phase("INTRO");
    // Observe the source caption during its beat, before waiting for the
    // timeout toast. The visual beat may end while a later assertion polls.
    await expect(page.getByTestId("matterport-still")).toContainText("Interior tour caption unavailable", { timeout: 7000 });
    await expect(page.getByRole("alert")).toContainText("Interior tour unavailable", { timeout: 7000 });
    await expect(page.getByTitle("Matterport interior tour")).toHaveCount(0);
    server.phase("POWER_UP");
    server.emit({ type: "building_revived", building_id: "233953", floors: [6, 7, 8], color: "#00ccff", category: "community", sqft: 94509, auto_completed: true });
    server.phase("REVIVED");
    await expect(page.getByTestId("energy-meter")).toContainText("The city helped finish this charge");
    await expect(page.getByTestId("revival-flash")).toHaveAttribute("data-soft", "true");
    await expect(page.getByTestId("concept-card")).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
