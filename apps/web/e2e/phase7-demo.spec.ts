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

for (const mode of ["kit", "fixtures"] as const) test(`admin shows broadcast and unmatched error toasts (${mode})`, async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  try {
    let emit: ((event: object) => void) | undefined;
    await context.routeWebSocket(/\/ws\/.*role=admin/, socket => {
      const server = socket.connectToServer();
      server.onMessage(message => socket.send(message));
      emit = event => socket.send(JSON.stringify(event));
    });
    const screen = await context.newPage();
    await screen.goto(`${baseURL}/screen`);
    await expect(screen.getByTestId("qr")).toBeVisible();
    const admin = await context.newPage();
    await admin.goto(`${baseURL}/admin`);
    await admin.getByLabel("Host PIN").fill("1234");
    await admin.getByRole("button", { name: `Data: ${mode}`, exact: true }).click();
    await expect(admin.getByText(new RegExp(`data mode: ${mode}`))).toBeVisible();
    // Exercise the real server's no-pitches broadcast by skipping through the empty round.
    for (let i = 0; i < 4; i++) await admin.getByRole("button", { name: "Skip phase", exact: true }).click();
    await expect(admin.getByRole("alert")).toContainText("No pitches");
    emit!({ type: "error", code: "invalid_command", message: "Unmatched command rejected", nonce: "unmatched" });
    await expect(admin.getByRole("alert")).toContainText("Unmatched command rejected");
  } finally { await context.close(); }
});

for (const mode of ["kit", "fixtures"] as const) test(`phone keeps tap selection without exposing ids while names load (${mode})`, async ({ browser, baseURL }) => {
  const desktop = await browser.newContext();
  const mobile = await browser.newContext();
  let releaseNames: (() => void) | undefined;
  const namesGate = new Promise<void>(resolve => { releaseNames = resolve; });
  try {
    const screen = await desktop.newPage();
    await screen.goto(`${baseURL}/screen`);
    await expect(screen.getByTestId("qr")).toBeVisible();
    const join = (await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
    const admin = await desktop.newPage();
    await admin.goto(`${baseURL}/admin`);
    await admin.getByLabel("Host PIN").fill("1234");
    await admin.getByRole("button", { name: `Data: ${mode}`, exact: true }).click();
    await expect(admin.getByText(new RegExp(`data mode: ${mode}`))).toBeVisible();
    await mobile.route("**/api/buildings", async route => { await namesGate; await route.continue(); });
    const phone = await mobile.newPage();
    await phone.goto(join);
    await phone.getByLabel("Nickname").fill("Ann");
    await phone.getByRole("button", { name: "Join", exact: true }).click();
    await admin.getByRole("button", { name: "Skip phase", exact: true }).click();
    await expect(phase(phone)).toHaveText("EXPLORE");
    await expect(phone.getByRole("button", { name: "Wake building Building 1", exact: true })).toBeVisible();
    await expect(phone.locator("body")).not.toContainText(/233953|F_[A-Za-z0-9_]+/);
    await phone.getByRole("button", { name: "Wake building Building 1", exact: true }).click();
    await expect(phase(screen)).toHaveText(/INTRO|PITCH/);
    await expect(screen.getByTestId("building-label")).toHaveText("Waking Esperson");
    releaseNames!();
    await admin.getByRole("button", { name: "Reset round", exact: true }).click();
    await expect(phone.getByRole("button", { name: "Wake building Esperson", exact: true })).toBeVisible();
  } finally { releaseNames!(); await Promise.all([desktop.close(), mobile.close()]); }
});
