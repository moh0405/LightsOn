import { expect, test, type Browser, type Page } from "@playwright/test";

// PRD protected moment 3: after the wake dive, the hero's lit floors must be on screen and not
// hidden behind a context tower. The suite runs phase timers at 0.1x, so REVIVED would last
// 0.8 s; the screen's socket holds the REVIVED -> EXPLORE change to mimic the real 8 s beat.
// Visibility is measured by pixels: screenshot the field, hide the hero's dark floors, screenshot
// again. Pixels that change are hero floor pixels the audience can actually see.
const HERO = "233953";
const SLIVER_PX = Number(process.env.LO_LIGHTUP_MIN_PX ?? 2000);
const phase = (page: Page) => page.getByTestId("phase").locator("strong");

async function changedPixels(browser: Browser, a: Buffer, b: Buffer): Promise<number> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    return await page.evaluate(async ([x, y]) => {
      const load = async (b64: string) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [p, q] = [await load(x), await load(y)];
      let count = 0;
      for (let i = 0; i < p.length; i += 4) {
        const changed = Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 24;
        // Lit in the first player's colour (#ff5d73); the charge bar shares it but never changes.
        const lit = p[i] > 170 && p[i] - p[i + 1] > 70 && p[i] - p[i + 2] > 50;
        if (changed && lit) count++;
      }
      return count;
    }, [a.toString("base64"), b.toString("base64")]);
  } finally { await context.close(); }
}

test("hero's lit floors are visible after the dive", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const mobile = await browser.newContext();
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
    const screen = await desktop.newPage();
    await screen.goto(`${baseURL}/screen`);
    const join = screen.locator("aside p").filter({ hasText: "/play?room=" });
    await expect(join).toBeVisible();
    const admin = await desktop.newPage();
    await admin.goto(`${baseURL}/admin`);
    await admin.getByLabel("Host PIN").fill("1234");
    await admin.getByRole("button", { name: "Data: kit", exact: true }).click();
    await expect(admin.getByText(/data mode: kit/)).toBeVisible();
    const phone = await mobile.newPage();
    await phone.goto((await join.innerText()).trim());
    await phone.getByLabel("Nickname").fill("Ann");
    await phone.getByRole("button", { name: "Join", exact: true }).click();
    await expect(phone.getByRole("heading", { name: "Ann", exact: true })).toBeVisible();
    await admin.getByRole("button", { name: "Skip phase", exact: true }).click();
    await expect(phase(screen)).toHaveText("EXPLORE");
    await phone.getByRole("button", { name: "Wake building Esperson", exact: true }).click();
    await expect(phase(screen)).toHaveText(/INTRO|PITCH/);
    await expect(screen.getByTestId("building-label")).toHaveText("Waking Esperson");
    // The dictation button keeps its dark fill so its light label stays readable (C8).
    const talk = phone.getByRole("button", { name: "Hold to talk", exact: true });
    await expect(talk).toBeVisible();
    expect(await talk.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(28, 34, 48)");
    await phone.getByLabel("Your pitch").fill("A public community gaming studio open at night");
    await phone.getByRole("button", { name: "Submit pitch", exact: true }).click();
    await expect(phase(screen)).toHaveText("NEGOTIATE", { timeout: 15000 });
    await phone.getByLabel("Your revision").fill("A public community gaming studio welcoming everyone at night");
    await phone.getByRole("button", { name: "Send revision", exact: true }).click();
    await expect(phase(screen)).toHaveText("POWER_UP", { timeout: 15000 });
    await phone.getByRole("button", { name: "Tap to charge", exact: true }).click();
    await expect(phase(screen)).toHaveText("REVIVED", { timeout: 15000 });
    // Light-up, flash, sparks and the settle ease (1.8 s) all finish.
    await screen.waitForTimeout(3500);
    await expect.poll(() => screen.evaluate(() => !window.__lightsOnMap!.isMoving())).toBe(true);
    const field = screen.getByTestId("field");
    const settle = () => screen.evaluate(() => new Promise<void>((resolve) => {
      const map = window.__lightsOnMap!;
      map.triggerRepaint();
      map.once("idle", () => resolve());
    }));
    await settle();
    await field.screenshot({ path: "e2e/screenshots/prefreeze/lightup-after-dive.png" });
    const lit = await field.screenshot();
    const hidden = await screen.evaluate((hero) => {
      const map = window.__lightsOnMap!;
      const filter = ["!", ["all", ["==", ["get", "building_id"], hero], ["==", ["get", "source_status"], "dark"]]];
      map.setFilter("floors", filter as never);
      return map.getFilter("floors") !== null;
    }, HERO);
    expect(hidden).toBe(true);
    await settle();
    const without = await field.screenshot();
    await screen.evaluate(() => window.__lightsOnMap!.setFilter("floors", null));
    const visible = await changedPixels(browser, lit, without);
    console.log(`visible lit-floor pixels: ${visible}`);
    // Before the fix a context tower left a sliver of the lit floors on screen.
    expect(visible).toBeGreaterThan(SLIVER_PX);
  } finally {
    await Promise.all([desktop.close(), mobile.close()]);
  }
});
