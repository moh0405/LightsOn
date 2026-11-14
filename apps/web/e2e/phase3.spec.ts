import { devices, expect, test, type BrowserContext, type WebSocketRoute } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { CityState, FloorStates, PlayerView, RoomStateMsg, ServerMessage } from "../src/lib/protocol";
import type { Phase } from "../src/lib/types";
import { mockSkyline } from "./skyline-data";

// Building facts come directly from the committed, verified dossier.
const dossier: { facts: { id: string; say_as: string | null }[] } = JSON.parse(readFileSync(new URL("../../../server/fixtures/dossiers/233953.json", import.meta.url), "utf8"));
const cited = dossier.facts.find((f) => f.id === "F_233953_floor_6_size_sqft")!;
const color = "#00ccff";

class RoundServer {
  phase: Phase = "LOBBY";
  players: PlayerView[] = [];
  sockets = new Set<WebSocketRoute>();
  commands: Record<string, unknown>[] = [];
  intro: RoomStateMsg["intro"] = null;
  charge = 0;
  revivedAt = 0;
  revived: RoomStateMsg["revived"] = {};
  floorStates: FloorStates = {};
  city: CityState = { buildings_revived: 0, sqft_reimagined: 0, song_layers: 0, needs: { housing: 40, food_retail: 30, entertainment: 15, community: 35 }, most_needed: "entertainment" };
  constructor(readonly mode: string) {}
  emit(message: ServerMessage) { for (const ws of this.sockets) ws.send(JSON.stringify(message)); }
  go(phase: Phase) {
    this.phase = phase;
    this.emit({ type: "phase_changed", phase, ends_at: null, round_id: ["LOBBY", "EXPLORE"].includes(phase) ? null : "R1" });
  }
  async route(context: BrowserContext) {
    await mockSkyline(context);
    await context.route("**/api/rooms", (r) => r.fulfill({ json: { room: "TEST", join_url: "http://127.0.0.1:15174/play?room=TEST", qr_svg: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="white"/></svg>' } }));
    await context.route("**/api/buildings/233953", (r) => r.fulfill({ json: dossier }));
    await context.routeWebSocket("**/ws/TEST?*", (ws) => {
      this.sockets.add(ws);
      let playerId = new URL(ws.url()).searchParams.get("player_id");
      ws.send(JSON.stringify({ type: "room_state", room: "TEST", phase: this.phase, round_id: this.phase === "LOBBY" ? null : "R1", building_id: "233953", target_floors: [6, 7, 8], ends_at: null, data_mode: this.mode, data_mode_scope: "process", hero_building_ids: ["233953"], players: this.players, intro: this.intro, city: this.city, revived: this.revived, floor_states: this.floorStates, charge: this.charge } satisfies RoomStateMsg));
      ws.onClose(() => this.sockets.delete(ws));
      ws.onMessage((raw) => {
        const cmd = JSON.parse(String(raw)) as Record<string, unknown>;
        this.commands.push({ ...cmd, player_id: playerId });
        if (cmd.type === "join") {
          playerId = `p${this.players.length + 1}`;
          const player = { id: playerId, nickname: String(cmd.nickname), color: this.players.length ? "#ff55bb" : color, connected: true };
          this.players.push(player);
          this.emit({ type: "player_joined", player });
          ws.send(JSON.stringify({ type: "ack", nonce: cmd.nonce, command: cmd.type, result: { player_id: playerId, color: player.color } }));
          return;
        }
        ws.send(JSON.stringify({ type: "ack", nonce: cmd.nonce, command: cmd.type, result: {} }));
        if (cmd.type === "submit_pitch" || cmd.type === "revise_pitch") this.emit({ type: "pitch_received", player_id: playerId!, text: String(cmd.text), origin: "web" });
        if (cmd.type === "contribute_energy") {
          this.charge += 25;
          this.emit({ type: "energy_updated", charge: this.charge, by_player_id: playerId });
          if (this.charge === 100) {
            this.revivedAt = Date.now();
            this.revived = { "233953": { floors: [6, 7, 8], color } };
            this.emit({ type: "building_revived", building_id: "233953", floors: [6, 7, 8], color, category: "entertainment", sqft: 94509, auto_completed: false });
            this.city = { ...this.city, buildings_revived: 1, sqft_reimagined: 94509, song_layers: 1, needs: { ...this.city.needs, entertainment: 45 }, most_needed: "food_retail" };
            this.emit({ type: "neighborhood_updated", needs: this.city.needs, most_needed: this.city.most_needed });
            this.go("REVIVED");
          }
        }
      });
    });
  }
}

for (const mode of ["kit", "fixtures"]) test(`Phase 3 complete round UI (${mode})`, async ({ browser, baseURL }, testInfo) => {
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const mobiles = await Promise.all([0, 1].map(() => browser.newContext({ ...devices["iPhone 13"] })));
  const server = new RoundServer(mode);
  const errors: string[] = [];
  try {
    await Promise.all([desktop, ...mobiles].map((c) => server.route(c)));
    const screen = await desktop.newPage();
    screen.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    screen.on("pageerror", (e) => errors.push(e.message));
    await screen.goto(`${baseURL}/screen`);
    await expect.poll(() => screen.evaluate(() => !!window.__lightsOnMap?.getLayer("floors"))).toBe(true);
    const phones = await Promise.all(mobiles.map((c) => c.newPage()));
    for (const [index, name] of ["Ann", "Bo"].entries()) {
      const phone = phones[index]!;
      phone.on("pageerror", (e) => errors.push(e.message));
      await phone.goto(`${baseURL}/play?room=TEST`);
      await phone.getByLabel("Nickname").fill(name);
      await phone.getByRole("button", { name: "Join", exact: true }).tap();
      await expect(phone.getByRole("heading", { name, exact: true })).toBeVisible();
    }
    server.emit({ type: "round_started", round_id: "R1", building_id: "233953", target_floors: [6, 7, 8] });
    server.go("INTRO");
    server.intro = { text: "Your city needs you.", audio_url: null, mood: "hopeful", analyst_line: "Bring me something fun." };
    server.emit({ type: "building_intro", ...server.intro });
    await expect(screen.getByTestId("subtitles")).toContainText("Your city needs you.");
    server.go("PITCH");
    await screen.reload();
    await expect(screen.getByTestId("subtitles")).toContainText("Your city needs you.");
    await expect(screen.getByTestId("subtitles")).toContainText("Bring me something fun.");
    await expect(phones[0]!.getByLabel("Your pitch")).toHaveAttribute("maxlength", "280");
    await expect(phones[0]!.getByRole("button", { name: "Submit pitch" })).toBeDisabled();
    for (const [i, text] of ["A public games space", "A community art space"].entries()) {
      await phones[i]!.getByLabel("Your pitch").fill(text);
      await phones[i]!.getByRole("button", { name: "Submit pitch" }).tap();
      await expect(phones[i]!.getByRole("status")).toContainText("Pitch sent");
      await expect(screen.getByRole("blockquote").filter({ hasText: text })).toBeVisible();
    }
    await screen.screenshot({ path: testInfo.outputPath("PITCH.png"), fullPage: true });
    server.go("CHALLENGE");
    for (const player of server.players) server.emit({ type: "counteroffer", player_id: player.id, line: cited.say_as!, fact_ids: [cited.id], counteroffer: player.id === "p1" ? "Will you keep it open to everyone?" : "Can neighbors make art together?", audio_url: null });
    await expect(screen.getByRole("region", { name: "Building counteroffers" })).toContainText(cited.say_as!);
    await screen.screenshot({ path: testInfo.outputPath("CHALLENGE.png"), fullPage: true });
    server.go("NEGOTIATE");
    await expect(phones[0]!.getByRole("blockquote")).toContainText("Will you keep it open to everyone?");
    await expect(phones[0]!.locator("body")).not.toContainText("Can neighbors make art together?");
    await phones[0]!.getByLabel("Your revision").fill("Free games and an open public lobby");
    await phones[0]!.getByRole("button", { name: "Send revision" }).tap();
    await expect(phones[0]!.getByRole("button", { name: "Sent", exact: true })).toBeDisabled();
    // A reload cannot accidentally submit a second revision.
    await phones[0]!.reload();
    await expect(phones[0]!.getByRole("button", { name: "Sent", exact: true })).toBeDisabled();
    expect(server.commands.filter((c) => c.type === "revise_pitch")).toHaveLength(1);
    server.go("VERDICT");
    server.emit({ type: "verdict", round_id: "R1", winner_player_id: "p1", scores: server.players.map((p, i) => ({ player_id: p.id, data_fit: 7, neighborhood_fit: 8 - i, creativity: 8 - i, charm: 7, needs_bonus: i ? 0 : 2, total: i ? 28 : 30 })), reason_line: "I'm in. Bring everyone together.", fact_ids: [cited.id], category: "entertainment", desire_met: true, desire_reveal: "I wanted a place for everyone.", impact: null });
    await expect(screen.getByTestId("score-card")).toContainText(cited.say_as!);
    await expect(phones[0]!.getByRole("heading", { name: "You won the deal!" })).toBeVisible();
    await expect(phones[1]!.getByText("Your score:")).toContainText("28/40");
    await screen.screenshot({ path: testInfo.outputPath("VERDICT.png"), fullPage: true });
    // The HUD must fit a 1080p projector without a document scroll.
    expect(await screen.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1080);
    server.go("POWER_UP");
    await expect(phones[0]!.getByRole("button", { name: "Tap to charge" })).toBeVisible();
    await screen.screenshot({ path: testInfo.outputPath("POWER_UP.png"), fullPage: true });
    await screen.evaluate(() => {
      const map = window.__lightsOnMap!;
      const original = map.setPaintProperty.bind(map);
      Object.assign(window, { firstLightAt: 0 });
      map.setPaintProperty = (...args: Parameters<typeof original>) => {
        if (args[1] === "fill-extrusion-color" && JSON.stringify(args[2]).includes("#00ccff")) {
          const target = window as Window & { firstLightAt: number };
          if (!target.firstLightAt) target.firstLightAt = Date.now();
        }
        return original(...args);
      };
    });
    for (let cycle = 0; cycle < 2; cycle++) {
      if (cycle) await phones[0]!.waitForTimeout(610); // Valid per-player gesture cadence.
      for (const phone of phones) await phone.getByRole("button", { name: "Tap to charge" }).tap();
      if (!cycle) await expect(screen.getByTestId("energy-meter")).toContainText("50%");
    }
    await expect(screen.getByTestId("energy-meter")).toContainText("100%");
    const firstLightAt = await screen.evaluate(() => (window as Window & { firstLightAt: number }).firstLightAt);
    expect(firstLightAt - server.revivedAt).toBeGreaterThanOrEqual(0);
    expect(firstLightAt - server.revivedAt).toBeLessThan(300);
    await expect.poll(() => screen.evaluate(() => JSON.stringify(window.__lightsOnMap!.getPaintProperty("floors", "fill-extrusion-color")))) .not.toContain("interpolate");
    const expression = await screen.evaluate(() => window.__lightsOnMap!.getPaintProperty("floors", "fill-extrusion-color"));
    expect(JSON.stringify(expression)).toContain(color);
    const meter = screen.getByTestId("city-meter");
    await expect(meter).toContainText("1 buildings revived");
    await expect(meter).toContainText("94,509 sq ft reimagined");
    await expect(meter).toContainText("game simulation");
    await expect(screen.getByRole("meter", { name: "Entertainment", exact: true })).toHaveAttribute("value", "45");
    const nonces = server.commands.filter((c) => c.type === "contribute_energy").map((c) => c.nonce);
    expect(new Set(nonces).size).toBe(4);
    await screen.screenshot({ path: testInfo.outputPath("REVIVED.png"), fullPage: true });
    await screen.reload();
    await expect.poll(() => screen.evaluate(() => JSON.stringify(window.__lightsOnMap?.getLayer("floors") ? window.__lightsOnMap.getPaintProperty("floors", "fill-extrusion-color") : null))) .toContain(color);
    await expect(screen.getByTestId("city-meter")).toContainText("1 buildings revived");
    await expect(screen.getByTestId("energy-meter")).toContainText("100%");
    server.emit({ type: "error", code: "no_pitches", message: "No pitches received. Round skipped." });
    server.go("EXPLORE");
    await expect(screen.getByRole("alert")).toContainText("Round skipped");
    expect(errors).toEqual([]);
  } finally { await Promise.all([desktop, ...mobiles].map((c) => c.close())); }
});


test("housing impact is explicitly a game estimate and unavailable evidence stays unknown", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const server = new RoundServer("fixtures");
  try {
    await server.route(context);
    const screen = await context.newPage();
    await screen.goto(`${baseURL}/screen`);
    await expect(screen.getByTestId("phase")).toContainText("LOBBY");
    server.go("VERDICT");
    server.emit({ type: "verdict", round_id: "R1", winner_player_id: "p1", scores: [], reason_line: "I'm in.", fact_ids: ["F_233953_occupied_sqft"], category: "housing", desire_met: false, desire_reveal: "", impact: { kind: "housing_estimate", sqft: 94509, units: 83, residents: 158, label: "rough game estimate, not a feasibility claim" } });
    await expect(screen.getByTestId("score-card")).toContainText("83 homes");
    await expect(screen.getByTestId("score-card")).toContainText("rough game estimate, not a feasibility claim");
    await expect(screen.getByLabel("Cited evidence")).toContainText("Source text unavailable");
  } finally { await context.close(); }
});


test("different winners retain per-floor colors after screen reload", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const server = new RoundServer("fixtures");
  server.phase = "REVIVED";
  server.revived = { "233953": { floors: [6, 7, 8, 17, 18], color: "#ff55bb" } };
  server.floorStates = { "233953": Object.fromEntries([6, 7, 8, 17, 18].map((floor) => [String(floor), { source_status: "dark" as const, game_status: "revived" as const, color: floor < 17 ? color : "#ff55bb" }])) };
  try {
    await server.route(context);
    const screen = await context.newPage();
    await screen.goto(`${baseURL}/screen`);
    for (let visit = 0; visit < 2; visit++) {
      if (visit) await screen.reload();
      await expect.poll(() => screen.evaluate(() => JSON.stringify(window.__lightsOnMap?.getLayer("floors") ? window.__lightsOnMap.getPaintProperty("floors", "fill-extrusion-color") : null))).toContain(color);
      const expression = await screen.evaluate(() => JSON.stringify(window.__lightsOnMap!.getPaintProperty("floors", "fill-extrusion-color")));
      expect(expression).toContain("#ff55bb");
      expect(expression).not.toContain("interpolate");
    }
  } finally { await context.close(); }
});
