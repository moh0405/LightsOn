import { expect, test, type Page } from "@playwright/test";

/** Overlays that leave the 1920x1080 projector or are cut by a scrolling ancestor. */
async function clipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("main [data-testid], main [role='region'], main button")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility !== "visible") continue;
      const name = el.dataset.testid ?? el.getAttribute("aria-label") ?? el.textContent?.slice(0, 30) ?? el.tagName;
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(`${name} leaves the viewport`);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible" && getComputedStyle(el).overflowX !== "auto") out.push(`${name} clips its content horizontally`);
    }
    if (document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1) out.push("page scrolls");
    return out;
  });
}

test("demo path: the 1920x1080 Esperson round never clips or scrolls", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/screen");
  await expect(page.getByTestId("qr")).toBeVisible();
  const shot = async (name: string) => {
    expect(await clipped(page), name).toEqual([]);
    await page.screenshot({ path: `e2e/screenshots/audit-fixes/demo-1080-${name}.png` });
  };
  const join = (await page.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
  const phones = await Promise.all([0, 1].map(async () => (await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } })).newPage()));
  for (const [index, phone] of phones.entries()) {
    await phone.goto(join);
    await phone.getByLabel("Nickname").fill(index === 0 ? "Ann" : "Bo");
    await phone.getByRole("button", { name: "Join", exact: true }).click();
  }
  await expect(page.getByTestId("phase")).toContainText("EXPLORE");
  await shot("explore");
  // Sample in the page: the approach label must never sit on top of the aerial.
  await page.evaluate(() => {
    const w = window as unknown as { introOverlap: number };
    w.introOverlap = 0;
    setInterval(() => { if (document.querySelector('[data-testid="intro-aerial"]') && document.querySelector('[data-testid="intro-approach"]')) w.introOverlap++; }, 30);
  });
  await phones[0]!.getByRole("button", { name: "Wake building Esperson", exact: true }).click();
  await expect(page.getByTestId("phase")).toContainText("INTRO");
  await expect(page.getByTestId("subtitles")).toBeVisible();
  await shot("intro");
  await expect(page.getByTestId("phase")).toContainText("PITCH", { timeout: 15000 });
  await phones[0]!.getByLabel("Your pitch").fill("A public community games space with late-night arcade leagues for downtown workers");
  await phones[0]!.getByRole("button", { name: "Submit pitch", exact: true }).click();
  await shot("pitch");
  await phones[1]!.getByLabel("Your pitch").fill("A shared food market with rotating local vendors and a rooftop supper club");
  await phones[1]!.getByRole("button", { name: "Submit pitch", exact: true }).click();
  await expect(page.getByTestId("phase")).toContainText("NEGOTIATE", { timeout: 40000 });
  await expect(page.getByRole("region", { name: "Building counteroffers" })).toBeVisible();
  await shot("counteroffers");
  await phones[0]!.getByLabel("Your revision").fill("A public community games space welcoming everyone at night, with free family hours");
  await phones[0]!.getByRole("button", { name: "Send revision", exact: true }).click();
  await shot("negotiate");
  await expect(page.getByTestId("score-card")).toBeVisible({ timeout: 15000 });
  await shot("verdict");
  await expect(page.getByTestId("phase")).toContainText("POWER_UP", { timeout: 15000 });
  await shot("power-up");
  for (const phone of phones) await phone.getByRole("button", { name: "Tap to charge", exact: true }).click();
  await expect(page.getByTestId("phase")).toContainText("REVIVED", { timeout: 15000 });
  await expect(page.getByTestId("city-meter")).toContainText("1 buildings revived");
  await shot("revived");
  expect(await page.evaluate(() => (window as unknown as { introOverlap: number }).introOverlap), "approach label and aerial never overlap").toBe(0);
  await page.keyboard.press("t");
  await expect(page.getByTestId("trace-panel")).toBeVisible();
  await shot("trace");
  await page.keyboard.press("t");
  await page.keyboard.press("h");
  await expect(page.getByRole("region", { name: "Host controls" })).toBeVisible();
  await shot("host");
  expect(errors).toEqual([]);
});
