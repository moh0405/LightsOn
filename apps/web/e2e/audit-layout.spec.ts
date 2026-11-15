import { expect, test, type Page } from "@playwright/test";

// Room state stub: layout only. Scores and needs are game-simulation numbers, not building facts.
const players = [
  { id: "p1", nickname: "Ann", color: "#ff5c5c", connected: true },
  { id: "p2", nickname: "Bo", color: "#4cc9f0", connected: true },
];
const city = { buildings_revived: 0, sqft_reimagined: 0, needs: { housing: 40, food_retail: 30, entertainment: 15, community: 35 }, most_needed: "entertainment", song_layers: 0 };
const verdict = { round_id: "layout", winner_player_id: "p1", reason_line: "Ann's plan wins the room.", fact_ids: [], category: "community", desire_met: true, desire_reveal: "I wanted company.", impact: null,
  scores: [{ player_id: "p1", data_fit: 8, neighborhood_fit: 7, creativity: 9, charm: 8, needs_bonus: 3, total: 35 }, { player_id: "p2", data_fit: 6, neighborhood_fit: 6, creativity: 7, charm: 7, needs_bonus: 0, total: 26 }] };

async function projector(page: Page, phase: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.route("**/api/rooms", (r) => r.fulfill({ json: { room: "LAYT", join_url: "http://127.0.0.1/play?room=LAYT", qr_svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' } }));
  await page.routeWebSocket("**/ws/LAYT?*", (ws) => {
    ws.send(JSON.stringify({ type: "room_state", room: "LAYT", phase, round_id: phase === "LOBBY" ? null : "layout", building_id: phase === "LOBBY" ? null : "233953",
      target_floors: [], ends_at: null, data_mode: "kit", data_mode_scope: "process", hero_building_ids: ["233953"], players, city, verdict: phase === "VERDICT" ? verdict : null }));
  });
  await page.goto("/screen");
  await expect(page.getByTestId("city-meter")).toBeVisible();
}

for (const [width, height] of [[390, 844], [360, 800]] as const) test(`A02: phone-width projector keeps a usable skyline at ${width}x${height}`, async ({ page }) => {
  await projector(page, "LOBBY", width, height);
  const stage = await page.locator(".city-stage").boundingBox();
  expect(stage!.width).toBeGreaterThanOrEqual(width - 40);
  expect(stage!.height).toBeGreaterThanOrEqual(300);
  await expect(page.getByTestId("phase")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: `e2e/screenshots/audit-fixes/lobby-${width}.png`, fullPage: true });
});

for (const phase of ["LOBBY", "VERDICT"]) test(`A03: city needs fit the 1280x720 sidebar (${phase})`, async ({ page }) => {
  await projector(page, phase, 1280, 720);
  const aside = await page.locator("main > aside").evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
  expect(aside.scroll, "sidebar content fits without hidden overflow").toBeLessThanOrEqual(aside.client);
  await expect(page.getByText(/Most needed: Entertainment/)).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("qr")).toBeInViewport({ ratio: 1 });
});

test("A04: score headings and cells do not wrap mid-word at 1280x720", async ({ page }) => {
  await projector(page, "VERDICT", 1280, 720);
  const card = page.getByTestId("score-card");
  await expect(card).toBeVisible();
  const cells = await card.locator("th, td").evaluateAll((els) => els.map((el) => {
    const range = document.createRange(); range.selectNodeContents(el);
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    return { text: el.textContent, lines, overflow: el.scrollWidth > el.clientWidth + 1 };
  }));
  for (const cell of cells) {
    expect(cell.lines, `"${cell.text}" fits on one line`).toBeLessThanOrEqual(1);
    expect(cell.overflow, `"${cell.text}" stays inside its cell`).toBe(false);
  }
  await page.screenshot({ path: "e2e/screenshots/audit-fixes/verdict-1280.png" });
});

for (const [width, height] of [[390, 844], [360, 800]] as const) test(`A12: trace panel fits a ${width}px phone`, async ({ page }) => {
  await page.route("**/api/buildings/233953/trace", (r) => r.fulfill({ json: { available: false, plan_recorded: false, events: [], files: [], configured_model_ids: [], notes: [] } }));
  await projector(page, "LOBBY", width, height);
  await page.keyboard.press("t");
  const panel = page.getByTestId("trace-panel");
  await expect(panel).toBeVisible();
  const size = await panel.evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
  await expect(panel.getByRole("button", { name: "Close · T / Esc" })).toBeInViewport({ ratio: 1 });
  await expect(panel.getByRole("heading", { name: "Live" })).toBeAttached();
  await page.screenshot({ path: `e2e/screenshots/audit-fixes/trace-${width}.png` });
  await panel.getByRole("button", { name: "Close · T / Esc" }).click();
  await expect(panel).toHaveCount(0);
});
