import { devices, expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mockSkyline } from "./skyline-data";

const persona: { building_id: string; intro_line: string; desire_key: string; neighbor_lines: Record<string, string> } =
  JSON.parse(readFileSync(new URL("../../../server/fixtures/personas/233953.json", import.meta.url), "utf8"));

for (const mode of ["kit", "fixtures"] as const) {
  test(`Phase 4 prepared persona reaches intro subtitles (${mode})`, async ({ browser, baseURL }) => {
    const desktop = await browser.newContext();
    const mobile = await browser.newContext({ ...devices["iPhone 13"] });
    const second = await browser.newContext({ ...devices["iPhone 13"] });
    await Promise.all([desktop, mobile, second].map(mockSkyline));
    const errors: string[] = [];
    try {
      const screen = await desktop.newPage();
      screen.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      screen.on("pageerror", (error) => errors.push(error.message));
      await screen.goto(`${baseURL}/screen`);
      await expect(screen.getByTestId("qr").locator("svg")).toBeVisible();
      const join = (await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
      const room = new URL(join).searchParams.get("room")!;
      const admin = await desktop.newPage();
      await admin.goto(`${baseURL}/admin`);
      await expect(admin.getByLabel("Room code")).toHaveValue(room);
      await admin.getByLabel("Host PIN").fill("1234");
      await admin.getByRole("button", { name: `Data: ${mode}`, exact: true }).click();
      await expect(admin.getByText(new RegExp(`data mode: ${mode}`))).toBeVisible();
      const response = await desktop.request.get(`${baseURL}/api/buildings/233953/persona`);
      expect(response.ok()).toBe(true);
      expect(await response.json()).toMatchObject(persona);
      expect(Object.keys(persona.neighbor_lines)).toHaveLength(3);
      const phone = await mobile.newPage();
      await phone.goto(join);
      await phone.getByLabel("Nickname").fill("Ann");
      await phone.getByRole("button", { name: "Join", exact: true }).tap();
      const other = await second.newPage();
      await other.goto(join);
      await other.getByLabel("Nickname").fill("Bo");
      await other.getByRole("button", { name: "Join", exact: true }).tap();
      await expect(phone.getByTestId("trackpad")).toBeVisible();
      await phone.getByRole("button", { name: "Wake building Esperson", exact: true }).tap();
      await expect(screen.getByText(persona.intro_line, { exact: true })).toBeVisible();
      await expect(screen.getByTestId("phase")).toContainText("PITCH");
      expect(errors).toEqual([]);
    } finally {
      await Promise.all([desktop, mobile, second].map((context) => context.close()));
    }
  });
}
