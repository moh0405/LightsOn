import { expect, test, type BrowserContext } from "@playwright/test";

// Names and IDs from the public Esperson models. Geometry in the iframe is a test stub.
const tours = [
  { model_id: "Wtxv2Mp8uQE", name: "Lobby", cover_url: null },
  { model_id: "nP2o5YT7nCP", name: "Underground Tunnel System", cover_url: null },
  { model_id: "wovF4kpoaw4", name: "808 Travis - Suite 550", cover_url: null },
];
async function stub(context: BrowserContext, timeout = false) {
  await context.route("**/api/buildings/*/tours", (route) => route.fulfill({ json: tours }));
  await context.route("https://my.matterport.com/show/**", (route) => timeout
    ? new Promise<void>(() => {})
    : route.fulfill({ contentType: "text/html", body: "<html><body style='background:#223344;color:white'>Public showcase test stub</body></html>" }));
}
for (const mode of ["kit", "fixtures"]) {
  test(`walk inside opens, switches tours, closes and keeps the round running (${mode})`, async ({ context, page, browser }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await stub(context);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/screen");
    await expect(page.getByTestId("qr")).toBeVisible();
    const admin = await context.newPage();
    await admin.goto("/admin");
    await admin.getByLabel("Host PIN").fill("1234");
    await admin.getByRole("button", { name: `Data: ${mode}`, exact: true }).click();
    await expect(admin.getByText(new RegExp(`data mode: ${mode}`))).toBeVisible();
    await page.keyboard.press("m");
    const walk = page.getByRole("region", { name: "Walk inside", exact: true });
    await expect(walk).toBeVisible();
    const frame = walk.getByTitle("Matterport interior tour");
    await expect(walk.getByRole("tab", { name: "Lobby", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(frame).toHaveAttribute("src", /m=Wtxv2Mp8uQE&play=1&qs=1&brand=0&help=0&hl=0/);
    await expect(frame).toHaveAttribute("allow", "fullscreen; xr-spatial-tracking");
    await walk.getByRole("tab", { name: "Underground Tunnel System", exact: true }).click();
    await expect(frame).toHaveAttribute("src", /m=nP2o5YT7nCP/);
    await page.keyboard.press("Escape");
    await expect(walk).toHaveCount(0);
    await page.getByRole("button", { name: "Walk inside · M", exact: true }).click();
    await expect(walk).toBeVisible();
    await page.keyboard.press("m");
    await expect(walk).toHaveCount(0);
    await admin.getByRole("button", { name: "Walk inside", exact: true }).click();
    await expect(walk).toBeVisible();
    // Real players wake the building; the INTRO timer continues behind the tour.
    const join = (await page.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
    const phones = await Promise.all([browser.newPage(), browser.newPage()]);
    for (const [index, phone] of phones.entries()) {
      await phone.goto(join);
      await phone.getByLabel("Nickname").fill(index === 0 ? "Ann" : "Bo");
      await phone.getByRole("button", { name: "Join", exact: true }).click();
    }
    await phones[0]!.getByRole("button", { name: "Wake building Esperson", exact: true }).click();
    await expect(page.getByTestId("phase")).toContainText("PITCH", { timeout: 8000 });
    await expect(walk).toBeVisible();
    await expect(page.getByTestId("subtitles")).toBeVisible();
    await expect(page.getByTestId("qr")).toBeVisible();
    await admin.getByRole("button", { name: "Close interior tour", exact: true }).click();
    await expect(walk).toHaveCount(0);
    expect(errors).toEqual([]);
    await Promise.all(phones.map((phone) => phone.close()));
  });
}

test("eight-second load timeout shows the cover and a quiet unavailable note", async ({ context, page }) => {
  await stub(context, true);
  // Use a local existing cover asset as the mocked player API's response.
  await context.route("**/api/buildings/233953/tours", (r) => r.fulfill({ json: tours.map((t) => ({ ...t, cover_url: "/media/233953/ortho.jpg" })) }));
  await page.goto("/screen");
  await expect(page.getByTestId("qr")).toBeVisible();
  await page.getByRole("button", { name: "Walk inside · M", exact: true }).click();
  const walk = page.getByRole("region", { name: "Walk inside", exact: true });
  await expect(walk.getByText(/Tour unavailable/)).toBeVisible({ timeout: 11000 });
  await expect(walk.locator("iframe")).toHaveCount(0);
  await expect(walk.locator("img")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await walk.getByRole("button", { name: "Back to city · Esc / M", exact: true }).click();
  await expect(walk).toHaveCount(0);
});

test("real Esperson lobby showcase at 1920x1080", async ({ page, context }) => {
  test.skip(process.env.LO_REAL_MATTERPORT !== "1", "Opt-in external visual verification");
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/screen");
  await expect(page.getByTestId("qr")).toBeVisible();
  await page.getByRole("button", { name: "Walk inside · M", exact: true }).click();
  const walk = page.getByRole("region", { name: "Walk inside", exact: true });
  await expect(walk.getByRole("tab", { name: "Lobby", exact: true })).toBeVisible({ timeout: 15000 });
  const frame = page.frameLocator('.walk-inside iframe');
  await expect(frame.locator("canvas").first()).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(15000); // Allow real WebGL textures and quick-start transition to finish.
  const admin = await context.newPage();
  await admin.goto("/admin");
  await admin.getByLabel("Host PIN").fill("1234");
  await admin.getByRole("button", { name: "Data: kit", exact: true }).click();
  await expect(page.getByTestId("data-mode-badge")).toHaveCount(0);
  await page.screenshot({ path: "e2e/screenshots/matterport/esperson-lobby-real.png" });
});

test("INTRO mounts the lobby immediately and holds its named view for six seconds", async ({ context, page }) => {
  await stub(context);
  await page.clock.install({ time: new Date("2026-11-14T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-14T12:00:01Z"));
  await context.route("**/api/rooms", (r) => r.fulfill({ json: { room: "TOUR", join_url: "http://localhost/play?room=TOUR", qr_svg: "<svg></svg>" } }));
  await context.routeWebSocket("**/ws/TOUR?*", (ws) => {
    ws.send(JSON.stringify({ type: "room_state", room: "TOUR", phase: "INTRO", round_id: "tour-test", building_id: "233953",
      target_floors: [], ends_at: null, data_mode: "kit", data_mode_scope: "process", hero_building_ids: ["233953"], players: [] }));
  });
  await page.goto("/screen");
  const frame = page.getByTitle("Matterport interior tour");
  await expect(frame).toHaveCount(1);
  await expect(page.getByTestId("matterport-still")).toContainText("Lobby");
  await page.clock.runFor(2100);
  await expect(frame).toBeVisible();
  await page.clock.runFor(5700);
  await expect(frame).toBeVisible();
  await page.clock.runFor(400);
  await expect(frame).toBeHidden();
  await expect(frame).toHaveCount(1); // Visibility changes never restart the iframe.
});
