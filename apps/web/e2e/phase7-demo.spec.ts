import { expect, test, type Page } from "@playwright/test";

const phase = (page: Page) => page.getByTestId("phase").locator("strong");

// The suite's server runs without DEMO_MODE, so this covers normal play: an unprepared hero
// (Wells Fargo Plaza) is not offered, Esperson and context buildings are, and /admin says how
// to turn the demo preset on.
test("wake list hides unprepared heroes; admin shows the demo preset state", async ({ browser, baseURL }) => {
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const mobile = await browser.newContext();
  try {
    const screen = await desktop.newPage();
    await screen.goto(`${baseURL}/screen`);
    const join = screen.locator("aside p").filter({ hasText: "/play?room=" });
    await expect(join).toBeVisible();
    const admin = await desktop.newPage();
    await admin.goto(`${baseURL}/admin`);
    await expect(admin.getByTestId("demo-preset")).toContainText("Demo preset off");
    await expect(admin.getByTestId("demo-preset")).toContainText("DEMO_MODE=1");
    await admin.getByLabel("Host PIN").fill("1234");
    const phone = await mobile.newPage();
    await phone.goto((await join.innerText()).trim());
    await phone.getByLabel("Nickname").fill("Ann");
    await phone.getByRole("button", { name: "Join", exact: true }).click();
    await admin.getByRole("button", { name: "Skip phase", exact: true }).click();
    await expect(phase(screen)).toHaveText("EXPLORE");
    await expect(phone.getByRole("button", { name: "Wake building Esperson", exact: true })).toBeVisible();
    await expect(phone.getByRole("button", { name: "Wake building Wells Fargo Plaza", exact: true })).toHaveCount(0);
    await expect(phone.getByRole("button", { name: /^Wake building / })).not.toHaveCount(1);
    await expect(admin.getByRole("button", { name: "Skip phase", exact: true })).toBeVisible();
    await expect(admin.getByRole("button", { name: "Reset round", exact: true })).toBeVisible();
    await admin.getByRole("button", { name: "Reset room", exact: true }).click();
    await expect(phase(screen)).toHaveText("LOBBY");
  } finally {
    await Promise.all([desktop.close(), mobile.close()]);
  }
});
