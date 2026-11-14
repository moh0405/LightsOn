import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import type { RoomStateMsg, ServerMessage } from "../src/lib/protocol";
import { mockSkyline } from "./skyline-data";

// Isolate the evidence view using a real, committed dossier fact. The real fake
// judge currently cites verified floor facts, so ordinary rounds miss this path.
const dossier = JSON.parse(readFileSync(new URL("../../../server/fixtures/dossiers/233953.json", import.meta.url), "utf8")) as {
  facts: { id: string; kind: string; source: string; say_as: string }[];
};
const aerial = dossier.facts.find((fact) => fact.source === "vexcel+vision")!;

test("Vexcel ScoreCard evidence preserves flyover date and labels its estimate", async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  try {
    await mockSkyline(context);
    await context.route("**/api/rooms", (route) => route.fulfill({ json: { room: "QA4", join_url: `${baseURL}/play?room=QA4`, qr_svg: "<svg/>" } }));
    await context.route("**/api/buildings/233953", (route) => route.fulfill({ json: dossier }));
    await context.routeWebSocket("**/ws/QA4?*", (socket) => {
      socket.send(JSON.stringify({
        type: "room_state", room: "QA4", phase: "VERDICT", round_id: "QA4",
        building_id: "233953", target_floors: [], ends_at: null,
        data_mode: "fixtures", data_mode_scope: "process", hero_building_ids: ["233953"],
        players: [], intro: null, revived: {}, floor_states: {}, charge: 0,
      } satisfies RoomStateMsg));
      socket.send(JSON.stringify({
        type: "verdict", round_id: "QA4", winner_player_id: "qa", scores: [],
        reason_line: "", fact_ids: [aerial.id], category: "culture",
        desire_met: false, desire_reveal: "", impact: null,
      } satisfies ServerMessage));
    });
    const page = await context.newPage();
    await page.goto(`${baseURL}/screen`);
    const evidence = page.getByTestId("score-card").getByLabel("Cited evidence");
    await expect(evidence).toContainText(aerial.say_as);
    expect(aerial.kind).toBe("estimate");
    const year = aerial.say_as.match(/\d{4}/)?.[0];
    expect(year).toBeTruthy();
    await expect(evidence).toContainText(`${year} flyover`);
    await page.screenshot({ path: testInfo.outputPath("vexcel-estimate-label.png") });
    mkdirSync(new URL("screenshots/qa-phase4/", import.meta.url), { recursive: true });
    await page.screenshot({ path: new URL("screenshots/qa-phase4/vexcel-estimate-label.png", import.meta.url).pathname });
    // Known product finding: Evidence renders say_as but drops Fact.kind.
    // Keep this narrowly expected until the product follow-up adds the label.
    test.fail(true, "Evidence omits the estimate label for Vexcel facts; see qa-phase4-report.md");
    await expect(evidence).toContainText(/estimate/i, { timeout: 1000 });
  } finally {
    await context.close();
  }
});
