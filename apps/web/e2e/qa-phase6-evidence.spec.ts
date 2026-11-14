import { devices, expect, test } from "@playwright/test";

// Real transport regression checks. These deliberately assert the requested
// acceptance behavior; failures are documented in qa-phase6-report.md.
test("Phase 6 optional persona fallback keeps the screen console clean", async ({ browser, baseURL }) => {
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const mobile = await browser.newContext({ ...devices["iPhone 13"] });
  const second = await browser.newContext({ ...devices["Pixel 7"] });
  try {
    const screen = await desktop.newPage();
    const errors: string[] = [];
    // App console errors only: the sandboxed third-party Matterport frame logs its own fetch failures.
    screen.on("console", message => {
      if (message.type() !== "error") return;
      const where = message.location().url;
      if (where && !where.startsWith(baseURL!)) return;
      errors.push(message.text());
    });
    screen.on("pageerror", error => errors.push(error.message));
    await screen.goto(`${baseURL}/screen`);
    await expect(screen.getByTestId("qr")).toBeVisible();
    await screen.getByRole("button", { name: "Start audio", exact: true }).click();
    const join = (await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
    const phone = await mobile.newPage();
    await phone.goto(join);
    await phone.getByLabel("Nickname").fill("QA");
    await phone.getByRole("button", { name: "Join", exact: true }).tap();
    const other = await second.newPage();
    await other.goto(join);
    await other.getByLabel("Nickname").fill("QA2");
    await other.getByRole("button", { name: "Join", exact: true }).tap();
    await expect(screen.getByTestId("phase")).toContainText("EXPLORE");
    const personaRequests: string[] = [];
    screen.on("request", request => { if (request.url().includes("/persona")) personaRequests.push(request.url()); });
    // TC Energy Center has no prepared persona: the screen must not ask for one.
    await phone.getByRole("button", { name: "Wake building TC Energy Center", exact: true }).tap();
    await expect(screen.getByTestId("subtitles")).toBeVisible();
    expect(personaRequests).toEqual([]);
    await screen.screenshot({ path: "e2e/artifacts/qa-phase6/persona-console-regression.png" });
    expect(errors).toEqual([]);
  } finally { await Promise.all([desktop, mobile, second].map(context => context.close())); }
});

test("Phase 6 every error event has a visible toast, including an unmatched nonce", async ({ page }) => {
  await page.addInitScript(() => {
    const sockets: WebSocket[] = [];
    const Native = window.WebSocket;
    Reflect.set(window, "qaSockets", sockets);
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        sockets.push(this);
        this.addEventListener("message", event => {
          const message: unknown = JSON.parse(String(event.data));
          if (message && typeof message === "object" && "type" in message && message.type === "error") Reflect.set(window, "qaError", message);
        });
      }
    };
  });
  await page.goto("/screen");
  await expect(page.getByTestId("qr")).toBeVisible();
  await expect(page.getByText("Connecting…", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const sockets = Reflect.get(window, "qaSockets") as WebSocket[];
    sockets.at(-1)!.send(JSON.stringify({ type: "wake", building_id: "999999999", nonce: "qa-unmatched-error" }));
  });
  await page.waitForFunction(() => Reflect.get(window, "qaError"));
  const message = await page.evaluate(() => (Reflect.get(window, "qaError") as { message: string }).message);
  await expect(page.getByRole("alert")).toContainText(message);
});

test("Phase 6 exported music state handles all category layers and ducking", async ({ page }) => {
  await page.goto("/screen");
  await expect(page.getByTestId("qr")).toBeVisible();
  const evidence = await page.evaluate(async () => {
    // Vite exposes the same module that the screen uses; no replacement audio implementation.
    const source = "/src/screen/music.ts";
    const { CityMusic, categoryLayers, layerDb } = await import(/* @vite-ignore */ source);
    const music = new CityMusic();
    const values: { category: string; first: number; repeated: number; normal: number; speaking: number }[] = [];
    for (const category of Object.keys(categoryLayers)) {
      music.revive(category);
      const first = music.state[category] as number;
      music.revive(category);
      values.push({ category, first, repeated: music.state[category] as number,
        normal: layerDb(music.state, category, false) as number, speaking: layerDb(music.state, category, true) as number });
    }
    return { layers: categoryLayers as Record<string, string>, values };
  });
  expect(evidence.layers).toEqual({ housing: "bass", food_retail: "drums", entertainment: "synth lead", community: "pads", culture: "strings", health: "arpeggio", work: "keys", wildcard: "bells" });
  for (const row of evidence.values) {
    expect(row.first, row.category).toBe(0);
    expect(row.repeated, row.category).toBe(3);
    expect(row.normal - row.speaking, row.category).toBe(8);
  }
});


test("Phase 6 a browser without Web Audio still opens the subtitle screen", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitAudioContext", { value: undefined, configurable: true });
  });
  await page.goto("/screen");
  await page.screenshot({ path: "e2e/artifacts/qa-phase6/audio-context-unavailable-regression.png" });
  await expect(page.getByTestId("qr")).toBeVisible();
  await page.getByRole("button", { name: "Start audio", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Audio unavailable");
});

for (const mode of ["kit", "fixtures"] as const) test(`Phase 6 four-player round fits the projector (${mode})`, async ({ browser, baseURL }) => {
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const controllers = await Promise.all(["iPhone 13", "Pixel 7", "iPhone 13", "Pixel 7"].map(device => browser.newContext({ ...devices[device] })));
  try {
    const screen = await desktop.newPage();
    await screen.goto(`${baseURL}/screen`);
    await expect(screen.getByTestId("qr")).toBeVisible();
    const admin = await desktop.newPage();
    await admin.goto(`${baseURL}/admin`);
    await admin.getByLabel("Host PIN").fill("1234");
    await admin.getByRole("button", { name: `Data: ${mode}`, exact: true }).click();
    await expect(admin.getByText(new RegExp(`data mode: ${mode}`))).toBeVisible();
    const join = (await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
    const phones = await Promise.all(controllers.map(context => context.newPage()));
    for (const [i, phone] of phones.entries()) {
      await phone.goto(join);
      await phone.getByLabel("Nickname").fill(`Player${i + 1}`);
      await phone.getByRole("button", { name: "Join", exact: true }).tap();
    }
    await phones[0]!.getByRole("button", { name: "Wake building Esperson", exact: true }).tap();
    await expect(screen.getByTestId("phase")).toContainText("PITCH");
    await Promise.all(phones.map(async phone => {
      await phone.getByLabel("Your pitch").fill("A shared public gaming studio welcoming everyone with spaces to learn and play together at night");
      await phone.getByRole("button", { name: "Submit pitch", exact: true }).tap();
    }));
    await expect(screen.getByTestId("phase")).toContainText("CHALLENGE");
    const checkLayout = async (phase: string) => {
      await screen.screenshot({ path: `e2e/artifacts/qa-phase6/${mode}-four-player-${phase}.png` });
      const bad = await screen.evaluate(() => [...document.querySelectorAll("p,li,td,th,small,figcaption,label,button")].filter(element => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        return parseFloat(getComputedStyle(element).fontSize) < 28 || rect.top < -1 || rect.left < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1;
      }).map(element => ({ text: element.textContent, rect: element.getBoundingClientRect().toJSON(), font: getComputedStyle(element).fontSize })));
      expect.soft(bad, `${mode} ${phase} projector clipping or body text below 28px`).toEqual([]);
    };
    await checkLayout("CHALLENGE");
    await expect(screen.getByTestId("phase")).toContainText("NEGOTIATE");
    await Promise.all(phones.map(async phone => {
      await phone.getByLabel("Your revision").fill("A shared public gaming studio welcoming everyone with an open ground floor and evening community events");
      await phone.getByRole("button", { name: "Send revision", exact: true }).tap();
    }));
    await expect(screen.getByTestId("phase")).toContainText("VERDICT");
    await checkLayout("VERDICT");
    await expect(screen.getByTestId("phase")).toContainText("REVIVED");
    await checkLayout("REVIVED");
  } finally { await Promise.all([desktop, ...controllers].map(context => context.close())); }
});
