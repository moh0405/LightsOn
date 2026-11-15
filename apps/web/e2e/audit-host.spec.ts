import { expect, test } from "@playwright/test";

test("A09: H opens host controls on the projector and they act with the host PIN", async ({ page }) => {
  await page.goto("/screen");
  await expect(page.getByTestId("qr")).toBeVisible();
  await page.keyboard.press("h");
  const panel = page.getByRole("region", { name: "Host controls" });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Host PIN").fill("0000");
  await panel.getByRole("button", { name: "Data: fixtures" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByTestId("data-mode-badge")).toHaveCount(0);
  await panel.getByLabel("Host PIN").fill("1234");
  await panel.getByRole("button", { name: "Data: fixtures" }).click();
  await expect(page.getByTestId("data-mode-badge")).toBeVisible();
  await panel.getByRole("button", { name: "Data: kit" }).click();
  await expect(page.getByTestId("data-mode-badge")).toHaveCount(0);
  await panel.getByLabel("Host PIN").press("h"); // typing in the PIN field never toggles the panel
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});
