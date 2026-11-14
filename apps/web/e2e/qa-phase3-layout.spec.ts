import { expect, test } from "@playwright/test";

// Uses the server's real QR SVG: the round UI tests supply a much smaller QR.
test("real QR and city needs fit the 1080p projector", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/screen");
  await expect(page.getByTestId("qr").locator("svg")).toBeVisible();
  await expect(page.getByTestId("city-meter")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("projector-overflow.png") });
  test.fail(true, "Known Phase 3 QA finding: the real QR pushes the needs summary below 1080p.");
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1080);
});
