import { expect, test, type Page } from "@playwright/test";

const phase = (page: Page) => page.getByTestId("phase").locator("strong");

for (const mode of ["kit", "fixtures"]) test(`connected phone drops exhausted buildings (${mode})`, async ({ browser, baseURL }) => {
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const mobile = await browser.newContext();
  try {
    const screen = await desktop.newPage();
    await screen.goto(`${baseURL}/screen`);
    const join = screen.locator("aside p").filter({ hasText: "/play?room=" });
    await expect(join).toBeVisible();
    const joinURL = (await join.innerText()).trim();
    const admin = await desktop.newPage();
    await admin.goto(`${baseURL}/admin`);
    await admin.getByLabel("Host PIN").fill("1234");
    await admin.getByRole("button", { name: `Data: ${mode}`, exact: true }).click();
    await expect(admin.getByText(new RegExp(`data mode: ${mode}`))).toBeVisible();
    const phone = await mobile.newPage();
    await phone.goto(joinURL);
    await phone.getByLabel("Nickname").fill("Ann");
    await phone.getByRole("button", { name: "Join", exact: true }).click();
    await expect(phone.getByRole("heading", { name: "Ann", exact: true })).toBeVisible();
    const skip = async (expected: string) => {
      await admin.getByRole("button", { name: "Skip phase", exact: true }).click();
      await expect(phase(screen)).toHaveText(expected);
    };
    await skip("EXPLORE");
    const wake = phone.getByRole("button", { name: "Wake building Esperson", exact: true });
    for (let round = 0; round < 4; round++) {
      await wake.click();
      await expect(phase(screen)).toHaveText("INTRO");
      await skip("PITCH");
      await phone.getByLabel("Your pitch").fill("A public museum");
      await phone.getByRole("button", { name: "Submit pitch", exact: true }).click();
      await expect(phone.getByRole("status")).toContainText("Pitch sent");
      if (round === 0) {
        const subtitles = (await screen.getByTestId("subtitles").textContent()) ?? "";
        await screen.reload();
        await expect(phase(screen)).toHaveText("PITCH");
        await expect(screen.getByTestId("subtitles")).toHaveText(subtitles);
      }
      for (const next of ["CHALLENGE", "NEGOTIATE", "VERDICT", "POWER_UP", "REVIVED"]) await skip(next);
      await skip("EXPLORE");
      if (round < 3) await expect(wake).toBeVisible();
    }
    await expect(wake).toHaveCount(0);
    await expect(phone.getByRole("button", { name: /^Wake building / }).first()).toBeVisible();
    await admin.getByRole("button", { name: "Reset room", exact: true }).click();
    await expect(phase(screen)).toHaveText("LOBBY");
  } finally {
    await Promise.all([desktop.close(), mobile.close()]);
  }
});
