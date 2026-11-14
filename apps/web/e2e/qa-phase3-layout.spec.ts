import { expect, test, type BrowserContext } from "@playwright/test";

// Uses the server's real QR SVG: the round UI tests supply a much smaller QR.
for (const players of [0, 2, 4]) test(`real QR and city needs fit the 1080p projector with ${players} players`, async ({ browser, baseURL }, testInfo) => {
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const phones: BrowserContext[] = [];
  try {
    const page = await desktop.newPage();
    await page.goto("/screen");
    await expect(page.getByTestId("qr").locator("svg")).toBeVisible();
    const join = page.locator("aside p").filter({ hasText: "/play?room=" });
    await expect(join).toBeVisible();
    const joinURL = (await join.innerText()).trim();
    for (let i = 0; i < players; i++) {
      const context = await browser.newContext();
      phones.push(context);
      const phone = await context.newPage();
      await phone.goto(joinURL);
      await phone.getByLabel("Nickname").fill(`Player${i + 1}`);
      await phone.getByRole("button", { name: "Join", exact: true }).click();
      await expect(phone.getByRole("heading", { name: `Player${i + 1}`, exact: true })).toBeVisible();
    }
    await expect(page.getByText(`Players (${players}/4)`)).toBeVisible();
    await expect(page.getByTestId("city-meter")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`projector-${players}.png`) });
    const size = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth,
      meterBottom: document.querySelector('[data-testid="city-meter"]')!.getBoundingClientRect().bottom,
      qrWidth: document.querySelector('[data-testid="qr"] svg')!.getBoundingClientRect().width,
      labels: Array.from(document.querySelectorAll('aside ul li, [data-testid="city-meter"] p, [aria-label="City needs"] label')).map((element) => {
        const bounds = element.getBoundingClientRect();
        return { text: element.textContent, fontSize: parseFloat(getComputedStyle(element).fontSize),
          top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right };
      }) }));
    expect(size.scrollHeight).toBeLessThanOrEqual(1080);
    expect(size.scrollWidth).toBeLessThanOrEqual(1920);
    expect(size.meterBottom).toBeLessThanOrEqual(1080);
    expect(size.qrWidth).toBeLessThanOrEqual(200);
    expect(size.qrWidth).toBeGreaterThanOrEqual(180);
    for (const label of size.labels) {
      expect(label.fontSize, label.text ?? "body label").toBeGreaterThanOrEqual(28);
      expect(label.top, label.text ?? "body label").toBeGreaterThanOrEqual(0);
      expect(label.bottom, label.text ?? "body label").toBeLessThanOrEqual(1080);
      expect(label.left).toBeGreaterThanOrEqual(0);
      expect(label.right).toBeLessThanOrEqual(1920);
    }
  } finally {
    await Promise.all([desktop, ...phones].map((context) => context.close()));
  }
});
