import { devices, expect, test } from "@playwright/test";
import { mockSkyline } from "./skyline-data";

test("recorded trace toggles, replays and fits a 1920x1080 screen", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  try {
    await mockSkyline(context);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${baseURL}/screen`);
    await expect(page.getByTestId("qr")).toBeVisible();
    await expect(page.getByTestId("trace-panel")).toHaveCount(0);
    await page.keyboard.press("t");
    const panel = page.getByTestId("trace-panel");
    await expect(panel).toContainText("Recorded prep run (deepagents on Amazon Bedrock)");
    await expect(panel.getByTestId("recorded-trace-step")).not.toHaveCount(0);
    await expect(panel).toContainText("property_scout");
    await expect(panel).toContainText("spatial_scout");
    await expect(panel).toContainText("persona_writer");
    await expect(panel).toContainText("validate_persona");
    await expect(panel).toContainText("us.anthropic.claude-sonnet-4-6");
    const total = await panel.getByTestId("recorded-trace-step").count();
    await panel.getByRole("button", { name: "Replay", exact: true }).click();
    await expect(panel.getByTestId("recorded-trace-step")).toHaveCount(0);
    await expect.poll(() => panel.getByTestId("recorded-trace-step").count()).toBeGreaterThan(0);
    await panel.getByRole("button", { name: "Pause", exact: true }).click();
    const paused = await panel.getByTestId("recorded-trace-step").count();
    await page.waitForTimeout(400);
    await expect(panel.getByTestId("recorded-trace-step")).toHaveCount(paused);
    await panel.getByRole("button", { name: "Show all", exact: true }).click();
    await expect(panel.getByTestId("recorded-trace-step")).toHaveCount(total);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
    await page.screenshot({ path: "e2e/screenshots/phase7/recorded-trace-1920x1080.png" });
    await page.keyboard.press("T");
    await expect(panel).toHaveCount(0);
    await page.getByRole("button", { name: "Agent trace · T", exact: true }).click();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("missing trace falls back while the screen remains usable", async ({ context, page }) => {
  await mockSkyline(context);
  await context.route("**/api/buildings/233953/trace", (route) => route.abort());
  await page.goto("/screen");
  await expect(page.getByTestId("qr")).toBeVisible();
  await page.keyboard.press("t");
  await expect(page.getByRole("alert")).toContainText("Recorded trace unavailable");
  await expect(page.getByTestId("live-trace")).toContainText("No agent steps");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("qr")).toBeVisible();
});

for (const mode of ["kit", "fixtures"] as const) {
  test(`live trace receives socket events during a complete round (${mode})`, async ({ browser, baseURL }) => {
    const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const mobile = await browser.newContext({ ...devices["iPhone 13"] });
    const second = await browser.newContext({ ...devices["iPhone 13"] });
    try {
      await Promise.all([desktop, mobile, second].map(mockSkyline));
      // Test-only trace metadata: fake-agent mode intentionally skips Bedrock events.
      // All game messages and actions still go to the real server.
      await desktop.routeWebSocket(/\/ws\/.*role=screen/, (socket) => {
        const server = socket.connectToServer();
        server.onMessage((message) => {
          socket.send(message);
          const event = JSON.parse(String(message)) as { type: string };
          if (event.type === "round_started") {
            socket.send(JSON.stringify({ type: "agent_step", step: "challenge", tool: "bedrock_challenge", summary: "challenge: bedrock_challenge", duration_ms: 42 }));
            socket.send(JSON.stringify({ type: "agent_step", step: "claim_check", tool: "bedrock_claim_check", summary: "claim_check: bedrock_claim_check", duration_ms: 12 }));
            socket.send(JSON.stringify({ type: "agent_step", step: "fallback", tool: "verdict", summary: "fallback: verdict (budget)", duration_ms: 2 }));
          }
        });
      });
      const screen = await desktop.newPage();
      const errors: string[] = [];
      screen.on("pageerror", (error) => errors.push(error.message));
      screen.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await screen.goto(`${baseURL}/screen`);
      await expect(screen.getByTestId("qr")).toBeVisible();
      const join = (await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
      const admin = await desktop.newPage();
      await admin.goto(`${baseURL}/admin`);
      await expect(admin.getByText(/· open ·/)).toBeVisible();
      await admin.getByLabel("Host PIN").fill("1234");
      await admin.getByRole("button", { name: `Data: ${mode}`, exact: true }).click();
      await expect(admin.getByText(new RegExp(`data mode: ${mode}`))).toBeVisible();
      const phone = await mobile.newPage();
      await phone.goto(join);
      await phone.getByLabel("Nickname").fill("Ann");
      await phone.getByRole("button", { name: "Join", exact: true }).tap();
      const other = await second.newPage();
      await other.goto(join);
      await other.getByLabel("Nickname").fill("Bo");
      await other.getByRole("button", { name: "Join", exact: true }).tap();
      await phone.getByRole("button", { name: "Wake building Esperson", exact: true }).tap();
      await expect(screen.getByTestId("phase")).toContainText("PITCH");
      await screen.keyboard.press("t");
      await expect(screen.getByTestId("live-trace-step")).toHaveCount(3);
      await expect(screen.getByTestId("live-trace")).toContainText("bedrock_claim_check");
      await expect(screen.getByTestId("live-trace")).toContainText("fallback: verdict (budget)");
      await phone.getByLabel("Your pitch").fill("A public community gaming studio open at night");
      await phone.getByRole("button", { name: "Submit pitch", exact: true }).tap();
      await other.getByLabel("Your pitch").fill("A public community gaming studio open at night");
      await other.getByRole("button", { name: "Submit pitch", exact: true }).tap();
      await expect(screen.getByTestId("phase")).toContainText("NEGOTIATE", { timeout: 15000 });
      await phone.getByLabel("Your revision").fill("A public community gaming studio welcoming everyone at night");
      await phone.getByRole("button", { name: "Send revision", exact: true }).tap();
      await expect(screen.getByTestId("phase")).toContainText("POWER_UP", { timeout: 15000 });
      await phone.getByRole("button", { name: "Tap to charge", exact: true }).tap();
      await expect(screen.getByTestId("phase")).toContainText("REVIVED");
      await screen.screenshot({ path: `e2e/screenshots/phase7/live-trace-${mode}-1920x1080.png` });
      await expect(screen.getByTestId("phase")).toContainText("EXPLORE", { timeout: 15000 });
      await expect(screen.getByTestId("live-trace-step")).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally { await Promise.all([desktop, mobile, second].map((context) => context.close())); }
  });
}
