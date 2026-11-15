import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { silence } from "./silence";

// Evidence for the in-round hero look: Esperson at INTRO end, PITCH, CHALLENGE and REVIVED on the
// 1920x1080 projector. Run with PHASE_DURATIONS_SCALE=0.5 so each beat lasts long enough to capture;
// HERO_SHOTS=before|after picks the file prefix.
const prefix = process.env.HERO_SHOTS ?? "after";
const dir = "e2e/screenshots/hero";
const phase = (page: Page) => page.getByTestId("phase").locator("strong");

test("Esperson reads as a crisp hero from wake to light-up", async ({ browser, baseURL }) => {
  test.skip(!process.env.HERO_SHOTS, "evidence run: set HERO_SHOTS=before|after and PHASE_DURATIONS_SCALE=0.5");
  test.setTimeout(180_000);
  mkdirSync(dir, { recursive: true });
  const desktop = await silence(await browser.newContext({ viewport: { width: 1920, height: 1080 } }));
  const mobile = await silence(await browser.newContext());
  try {
    let revived = false;
    await desktop.routeWebSocket(/\/ws\/.*role=screen/, (socket) => {
      const server = socket.connectToServer();
      server.onMessage((message) => {
        const event = JSON.parse(String(message)) as { type: string; phase?: string };
        if (event.type === "phase_changed" && event.phase === "REVIVED") revived = true;
        if (revived && event.type === "phase_changed" && event.phase === "EXPLORE") return;
        socket.send(message);
      });
    });
    const errors: string[] = [];
    const screen = await desktop.newPage();
    screen.on("pageerror", (error) => errors.push(error.message));
    screen.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await screen.goto(`${baseURL}/screen`);
    const join = screen.locator("aside p").filter({ hasText: "/play?room=" });
    await expect(join).toBeVisible();
    const admin = await desktop.newPage();
    await admin.goto(`${baseURL}/admin`);
    await admin.getByLabel("Host PIN").fill("1234");
    await admin.getByRole("button", { name: "Data: kit", exact: true }).click();
    const phone = await mobile.newPage();
    await phone.goto((await join.innerText()).trim());
    await phone.getByLabel("Nickname").fill("Ann");
    await phone.getByRole("button", { name: "Join", exact: true }).click();
    await admin.getByRole("button", { name: "Skip phase", exact: true }).click();
    await expect(phase(screen)).toHaveText("EXPLORE");
    await expect(screen.getByTestId("field")).toHaveAttribute("data-facts-ready", "true");
    await screen.waitForTimeout(1500);
    await screen.screenshot({ path: `${dir}/${prefix}-0-explore.png` });
    const settled = async () => {
      await expect.poll(() => screen.evaluate(() => !window.__lightsOnMap!.isMoving())).toBe(true);
      await screen.evaluate(() => new Promise<void>((resolve) => {
        const map = window.__lightsOnMap!;
        map.once("idle", () => resolve());
        map.triggerRepaint();
      }));
    };
    await phone.getByRole("button", { name: "Wake building Esperson", exact: true }).click();
    await expect(phase(screen)).toHaveText("INTRO");
    await screen.waitForTimeout(3000);
    await settled();
    await screen.screenshot({ path: `${dir}/${prefix}-1-intro-end.png` });
    await expect(phase(screen)).toHaveText("PITCH", { timeout: 15000 });
    await screen.waitForTimeout(800);
    await screen.screenshot({ path: `${dir}/${prefix}-2-pitch.png` });
    // The round view never uses the banned word or shows raw ids.
    const text = await screen.locator("body").innerText();
    expect(text.toLowerCase()).not.toContain("vacant");
    expect(text).not.toContain("233953");
    await phone.getByLabel("Your pitch").fill("A public community gaming studio open at night");
    await phone.getByRole("button", { name: "Submit pitch", exact: true }).click();
    await expect(phase(screen)).toHaveText("CHALLENGE", { timeout: 60000 });
    await screen.waitForTimeout(800);
    await screen.screenshot({ path: `${dir}/${prefix}-3-challenge.png` });
    await expect(phase(screen)).toHaveText("NEGOTIATE", { timeout: 60000 });
    await phone.getByLabel("Your revision").fill("A public community gaming studio welcoming everyone at night");
    await phone.getByRole("button", { name: "Send revision", exact: true }).click();
    await expect(phase(screen)).toHaveText("POWER_UP", { timeout: 60000 });
    await phone.getByRole("button", { name: "Tap to charge", exact: true }).click();
    await expect(phase(screen)).toHaveText("REVIVED", { timeout: 60000 });
    await screen.waitForTimeout(700);
    await screen.screenshot({ path: `${dir}/${prefix}-4-revived-lighting.png` });
    await screen.waitForTimeout(3500);
    await settled();
    await screen.screenshot({ path: `${dir}/${prefix}-5-revived.png` });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([desktop.close(), mobile.close()]);
  }
});
