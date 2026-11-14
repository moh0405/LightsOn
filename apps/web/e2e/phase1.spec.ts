import { devices, expect, test, type Page } from "@playwright/test";

import { mockSkyline } from "./skyline-data";

const phase = (page: Page) => page.getByTestId("phase").locator("strong");

for (const mode of ["kit", "fixtures"] as const) {
  test(`Phase 1 exit gate (${mode})`, async ({ browser, baseURL }) => {
    const desktop = await browser.newContext();
    const mobiles = await Promise.all([0, 1, 2].map(() => browser.newContext({ ...devices["iPhone 13"] })));
    await Promise.all([desktop, ...mobiles].map(mockSkyline));
    const errors: string[] = [];
    try {
      const screen = await desktop.newPage();
      screen.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      screen.on("pageerror", (error) => errors.push(error.message));
      await screen.goto(`${baseURL}/screen`);
      await expect(screen.getByTestId("qr").locator("svg")).toBeVisible();
      const joinURL = (await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
      expect(new URL(joinURL).origin).toBe(baseURL);
      const room = new URL(joinURL).searchParams.get("room")!;
      const admin = await desktop.newPage();
      await admin.goto(`${baseURL}/admin`);
      await expect(admin.getByLabel("Room code")).toHaveValue(room);
      await expect(admin.getByText(/· open ·/)).toBeVisible();
      await admin.getByLabel("Host PIN").fill("1234");
      await admin.getByRole("button", { name: `Data: ${mode}`, exact: true }).click();
      await expect(admin.getByText(new RegExp(`data mode: ${mode}`))).toBeVisible();

      const phones = await Promise.all(mobiles.map((context) => context.newPage()));
      for (const [index, name] of ["Ann", "Bo", "Cy"].entries()) {
        const phone = phones[index]!;
        await phone.goto(joinURL);
        await phone.getByLabel("Nickname").fill(name);
        await phone.getByRole("button", { name: "Join", exact: true }).click();
        await expect(phone.getByRole("heading", { name, exact: true })).toBeVisible();
      }
      const ann = phones[0]!;
      await expect(screen.getByRole("heading", { name: "Players (3/4)", exact: true })).toBeVisible();
      await expect(screen.locator("aside li")).toHaveCount(3);
      for (const name of ["Ann", "Bo", "Cy"]) await expect(screen.locator("aside li").filter({ hasText: name })).toBeVisible();
      const colors = await screen.locator("aside li span").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color));
      expect(new Set(colors).size).toBe(3);
      for (const page of [screen, ...phones]) await expect(phase(page)).toHaveText("EXPLORE");

      // Send a real touch drag through Chromium's input pipeline, producing pointer events.
      const trackpad = await ann.getByTestId("trackpad").boundingBox();
      expect(trackpad).not.toBeNull();
      const pad = trackpad!;
      const touch = await mobiles[0]!.newCDPSession(ann);
      const point = (fraction: number) => [{ x: pad.x + pad.width * fraction, y: pad.y + pad.height * fraction }];
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(0.2) });
      const dot = screen.getByTestId("dot").filter({ hasText: "Ann" });
      await expect(dot).toBeVisible();
      await expect(dot).toHaveCSS("background-color", colors[0]!);
      await expect.poll(() => dot.evaluate((node) => (node as HTMLElement).style.left)).toBe("20%");
      for (const fraction of [0.3, 0.45, 0.6, 0.75]) {
        await ann.waitForTimeout(50); // a human drag spans multiple 33ms pointer throttle windows
        await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(fraction) });
      }
      await expect.poll(async () => parseFloat(await dot.evaluate((node) => (node as HTMLElement).style.left))).toBeCloseTo(75, 0);
      await expect.poll(async () => parseFloat(await dot.evaluate((node) => (node as HTMLElement).style.top))).toBeCloseTo(75, 0);
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

      await admin.getByLabel("Host PIN").fill("wrong");
      await admin.getByRole("button", { name: "Skip phase", exact: true }).click();
      await expect(admin.getByRole("alert")).toContainText(/pin/i);
      await expect(phase(screen)).toHaveText("EXPLORE");
      await admin.getByLabel("Host PIN").fill("1234");
      await admin.getByRole("button", { name: "Skip phase", exact: true }).click();
      for (const page of [screen, ...phones]) await expect(phase(page)).toHaveText("INTRO");
      await admin.getByRole("button", { name: "Reset round", exact: true }).click();
      for (const page of [screen, ...phones]) await expect(phase(page)).toHaveText("EXPLORE");

      // Record every phase in the rendered screen, including short timer phases.
      await screen.evaluate(() => {
        const observed: string[] = [];
        const element = document.querySelector('[data-testid="phase"] strong')!;
        const record = () => { const text = element.textContent!; if (observed.at(-1) !== text) observed.push(text); };
        record();
        new MutationObserver(record).observe(element, { subtree: true, childList: true, characterData: true });
        Object.assign(window, { observedPhases: observed });
      });
      await ann.getByRole("button", { name: /^Wake building / }).first().tap();
      await expect(phase(screen)).toHaveText("PITCH");
      for (const [index, phone] of phones.entries()) {
        await phone.getByLabel("Your pitch").fill(["A public games space", "A community art space", "A neighborhood café"][index]!);
        await phone.getByRole("button", { name: "Submit pitch", exact: true }).tap();
        await expect(phone.getByRole("status")).toContainText("Pitch sent");
      }
      const playerId = await ann.evaluate((key) => localStorage.getItem(key), `lo.player.${room}`);
      expect(playerId).toBeTruthy();
      await ann.reload();
      await expect(ann.getByRole("heading", { name: "Ann", exact: true })).toBeVisible();
      await expect(ann.getByLabel("Nickname")).toHaveCount(0);
      await expect(phase(ann)).toHaveText("PITCH");
      expect(await ann.evaluate((key) => localStorage.getItem(key), `lo.player.${room}`)).toBe(playerId);
      await expect(screen.locator("aside li")).toHaveCount(3);
      await expect(phase(screen)).toHaveText("EXPLORE", { timeout: 20_000 });
      expect(await screen.evaluate(() => (window as Window & { observedPhases?: string[] }).observedPhases)).toEqual([
        "EXPLORE", "INTRO", "PITCH", "CHALLENGE", "NEGOTIATE", "VERDICT", "POWER_UP", "REVIVED", "EXPLORE",
      ]);
      for (const phone of phones) await expect(phase(phone)).toHaveText("EXPLORE");
      // No pitches means no invented deal: skip back to the city and explain why.
      await ann.getByRole("button", { name: /^Wake building / }).first().tap();
      await expect(phase(screen)).toHaveText("PITCH");
      await expect(phase(screen)).toHaveText("EXPLORE", { timeout: 20_000 });
      await expect(screen.getByRole("alert")).toContainText(/No pitches/i);
      for (const phone of phones) await expect(phase(phone)).toHaveText("EXPLORE");
      expect(errors, "screen console and runtime errors during the complete round").toEqual([]);
    } finally {
      await Promise.all([...mobiles, desktop].map((context) => context.close()));
    }
  });
}
