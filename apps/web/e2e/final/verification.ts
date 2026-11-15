import { expect, test, type Page } from "@playwright/test";

const mode = process.env.DEMO_MODE === "1" ? "demo" : "normal";
const phase = (page: Page) => page.getByTestId("phase").locator("strong");

test(`three real-kit rounds with visible light-up and images (${mode})`, async ({ browser, baseURL }) => {
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  try {
    const screen = await desktop.newPage();
    const phone = await mobile.newPage();
    const buildings = await (await screen.request.get(`${baseURL}/api/buildings`)).json() as { id: string }[];
    const propertyIds = buildings.map(building => building.id);
    for (const page of [screen, phone]) {
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(`${message.location().url}: ${message.text()}`); });
      await page.addInitScript((ids: string[]) => {
        // Observe all rendered UI text throughout the round, including brief transition beats.
        Reflect.set(window, "rawIds", []);
        addEventListener("DOMContentLoaded", () => {
          const inspect = () => {
            const text = document.body.innerText;
            const matches = text.match(new RegExp(`\\bF_[A-Za-z0-9_]+\\b|\\b(?:${ids.join("|")})\\b`, "g"));
            if (matches) (Reflect.get(window, "rawIds") as string[]).push(...matches);
          };
          new MutationObserver(inspect).observe(document.body, { subtree: true, childList: true, characterData: true });
          inspect();
        });
        const Native = window.WebSocket;
        window.WebSocket = class extends Native {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);
            this.addEventListener("message", event => {
              if ((JSON.parse(String(event.data)) as { type: string }).type === "building_revived") Reflect.set(window, "revivedAt", performance.now());
            });
          }
        };
      }, propertyIds);
    }
    await screen.goto(`${baseURL}/screen`);
    await expect(screen.getByTestId("qr")).toBeVisible();
    const join = (await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
    const admin = await desktop.newPage();
    await admin.goto(`${baseURL}/admin`);
    await admin.getByLabel("Host PIN").fill("1234");
    await admin.getByRole("button", { name: "Data: kit", exact: true }).click();
    await expect(admin.getByText(/data mode: kit/)).toBeVisible();
    await expect(admin.getByTestId("demo-preset")).toContainText(mode === "demo" ? "Demo preset ON" : "Demo preset off");
    await phone.goto(join);
    await phone.getByLabel("Nickname").fill("Ann");
    await phone.getByRole("button", { name: "Join", exact: true }).tap();
    const skip = async (next: string) => {
      await admin.getByRole("button", { name: "Skip phase", exact: true }).click();
      await expect(phase(screen)).toHaveText(next);
    };
    for (let round = 1; round <= 3; round++) {
      const shot = async (beat: string) => {
        await screen.screenshot({ path: `e2e/screenshots/final/${mode}-${round}-${beat}.png` });
      };
      await shot("lobby");
      await skip("EXPLORE");
      await shot("explore");
      await phone.getByRole("button", { name: "Wake building Esperson", exact: true }).tap();
      await expect(phase(screen)).toHaveText("INTRO");
      await shot("dive");
      const aerial = screen.getByTestId("intro-aerial").locator("img");
      await expect(aerial).toBeVisible();
      await expect.poll(() => aerial.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await shot("aerial");
      await expect(screen.getByTestId("matterport-still")).toBeVisible({ timeout: 6000 });
      await shot("interior");
      await expect(phase(screen)).toHaveText("PITCH", { timeout: 10000 });
      await phone.getByLabel("Your pitch").fill("A public community gaming studio open at night");
      await phone.getByRole("button", { name: "Submit pitch", exact: true }).tap();
      await shot("pitch");
      await skip("CHALLENGE");
      await shot("challenge");
      await skip("NEGOTIATE");
      await phone.getByLabel("Your revision").fill("A public community gaming studio welcoming everyone at night");
      await phone.getByRole("button", { name: "Send revision", exact: true }).tap();
      await shot("negotiate");
      await skip("VERDICT");
      await shot("verdict");
      await skip("POWER_UP");
      await shot("power-up");
      for (let i = 0; i < 4; i++) {
        await phone.getByRole("button", { name: "Tap to charge", exact: true }).tap();
        if (i < 3) await phone.waitForTimeout(650);
      }
      await expect(phase(screen)).toHaveText("REVIVED");
      // Read the actual WebGL pixels in the first second after the received event.
      // Red pixels are limited to the map canvas (excluding UI/charge controls).
      const visible = await screen.evaluate(async () => {
        const start = Reflect.get(window, "revivedAt") as number;
        const canvas = document.querySelector("canvas.maplibregl-canvas") as HTMLCanvasElement;
        const gl = canvas.getContext("webgl2")!;
        return new Promise<{ pixels: number; elapsed: number }>(resolve => {
          const sample = () => {
            window.__lightsOnMap!.triggerRepaint();
            window.__lightsOnMap!.once("render", () => {
              const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
              gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
              let pixels = 0;
              for (let i = 0; i < data.length; i += 4) if (data[i] > 170 && data[i] - data[i + 1] > 70 && data[i] - data[i + 2] > 50) pixels++;
              const elapsed = performance.now() - start;
              if (pixels > 0 || elapsed >= 1000) resolve({ pixels, elapsed });
              else requestAnimationFrame(sample);
            });
          };
          sample();
        });
      });
      console.log(`${mode} round ${round}: ${JSON.stringify(visible)}`);
      expect(visible.pixels).toBeGreaterThan(0);
      expect(visible.elapsed).toBeLessThanOrEqual(1000);
      await shot("light-up");
      const concept = screen.getByTestId("concept-card");
      await expect(concept).toBeVisible();
      await expect(concept.locator("img")).toHaveCount(2);
      expect(await concept.locator("img").evaluateAll(images => images.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
      await shot("concept");
      await screen.keyboard.press("t");
      await expect(screen.getByTestId("recorded-trace-step")).not.toHaveCount(0);
      await shot("trace");
      await screen.keyboard.press("Escape");
      for (const page of [screen, phone]) expect(await page.evaluate(() => Reflect.get(window, "rawIds"))).toEqual([]);
      expect(errors).toEqual([]);
      await admin.getByRole("button", { name: "Reset room", exact: true }).click();
      await expect(phase(screen)).toHaveText("LOBBY");
      if (round < 3) {
        await phone.reload();
        await phone.getByLabel("Nickname").fill("Ann");
        await phone.getByRole("button", { name: "Join", exact: true }).tap();
      }
    }
  } finally { await Promise.all([desktop.close(), mobile.close()]); }
});
