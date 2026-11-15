import { devices, expect, test } from "@playwright/test";
import { floors, mockSkyline } from "./skyline-data";
import { assertFramed } from "./camera-assertions";
import type { FeatureCollection } from "geojson";

test("Phase 2: skyline, touch beam, cached facts and wake dive", async ({ browser, baseURL }, testInfo) => {
  const desktop = await browser.newContext();
  const mobile = await browser.newContext({ ...devices["iPhone 13"] });
  const second = await browser.newContext({ ...devices["iPhone 13"] });
  const errors: string[] = [];
  try {
    await Promise.all([desktop, mobile, second].map(mockSkyline));
    const screen = await desktop.newPage();
    screen.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    screen.on("pageerror", (e) => errors.push(e.message));
    let factsRequests = 0;
    screen.on("request", (r) => { if (r.url().endsWith("/api/buildings/233953")) factsRequests++; });
    await screen.goto(`${baseURL}/screen`);
    await expect(screen.getByTestId("qr").locator("svg")).toBeVisible();
    const join = (await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
    const phone = await mobile.newPage();
    const other = await second.newPage();
    for (const [page, name] of [[phone, "Ann"], [other, "Bo"]] as const) {
      await page.goto(join); await page.getByLabel("Nickname").fill(name);
      await page.getByRole("button", { name: "Join", exact: true }).tap();
    }
    await expect(phone.getByTestId("trackpad")).toBeVisible();
    await expect(screen.getByTestId("phase")).toContainText("EXPLORE");
    await expect.poll(() => screen.evaluate(() => !!window.__lightsOnMap?.getLayer("floors"))).toBe(true);
    const paint = await screen.evaluate(() => window.__lightsOnMap!.getPaintProperty("floors", "fill-extrusion-color"));
    expect(JSON.stringify(paint)).toContain('"dark","#1a1d2b"');
    expect(JSON.stringify(paint)).toContain('"occupied","#f2c46d"');
    expect(JSON.stringify(paint)).toContain("#3a3f52");
    const dark = await screen.evaluate(async () => {
      const source = window.__lightsOnMap!.getSource("floors");
      if (!source || source.type !== "geojson") throw new Error("Missing floor source");
      const data = await source.getData();
      if (data.type !== "FeatureCollection") throw new Error("Missing features");
      return data.features.filter((f) => f.properties?.source_status === "dark").map((f) => f.properties?.floor_number);
    });
    expect(dark).toEqual([6, 7, 8]);

    // Readiness includes prefetched dossiers; the first hover must paint facts
    // synchronously even if the network becomes unavailable afterward.
    await expect(screen.getByTestId("field")).toHaveAttribute("data-facts-ready", "true");
    expect(factsRequests).toBe(1);
    await screen.route(/\/api\/buildings\/[^/?]+$/, (route) => route.abort());
    await screen.evaluate(() => {
      const field = document.querySelector('[data-testid="field"]')!;
      field.setAttribute("data-saw-loading", "false");
      new MutationObserver((records) => {
        if (records.some((r) => Array.from(r.addedNodes).some((n) => n.textContent?.includes("Loading facts")))) {
          field.setAttribute("data-saw-loading", "true");
        }
      }).observe(field, { childList: true, subtree: true });
    });

    // Locate an actually rendered hero pixel, then send it through the phone trackpad.
    const hit = await screen.evaluate(() => {
      const map = window.__lightsOnMap!;
      const { width, height } = map.getCanvas().getBoundingClientRect();
      for (let y = 30; y < height; y += 4) for (let x = 0; x < width; x += 4) {
        if (map.queryRenderedFeatures([x, y], { layers: ["floors"] })[0]?.properties?.building_id === "233953") return { x: x / width, y: y / height };
      }
      throw new Error("Hero not rendered");
    });
    const box = (await phone.getByTestId("trackpad").boundingBox())!;
    await phone.touchscreen.tap(box.x + box.width * hit.x, box.y + box.height * hit.y);
    await expect(screen.getByTestId("hover-card")).toContainText("Esperson");
    await expect(screen.getByTestId("hover-card")).toContainText("27 stories");
    await expect(screen.getByTestId("hover-card")).toContainText("3 dark floors");
    await expect(screen.getByTestId("field")).toHaveAttribute("data-saw-loading", "false");
    const outlines = await screen.evaluate(() => window.__lightsOnMap!.getStyle().layers!.filter((l) => l.id.startsWith("hover-")).map((l) => window.__lightsOnMap!.getFilter(l.id)));
    expect(JSON.stringify(outlines)).toContain("233953");
    expect(factsRequests).toBe(1);
    await screen.screenshot({ path: testInfo.outputPath("screen-explore.png") });
    await expect.poll(() => screen.evaluate(() => !window.__lightsOnMap!.isMoving())).toBe(true);
    const before = await screen.evaluate(() => window.__lightsOnMap!.getZoom());
    await phone.getByRole("button", { name: "Wake building Esperson", exact: true }).tap();
    await expect.poll(() => screen.evaluate(() => window.__lightsOnMap!.getZoom()), { timeout: 7000 }).toBeGreaterThan(before);
    // Framing depends on the real volume and canvas, not a fixed zoom threshold.
    const center = await screen.evaluate(() => window.__lightsOnMap!.getCenter().toArray());
    expect(Math.hypot((center[0]! + 95.3650891) * 96000, (center[1]! - 29.7588018) * 111000)).toBeLessThan(250);
    await screen.screenshot({ path: testInfo.outputPath("screen-dive.png") });
    await expect(screen.getByTestId("phase")).toContainText("EXPLORE", { timeout: 25000 });
    await expect.poll(() => screen.evaluate(() => !window.__lightsOnMap!.isMoving())).toBe(true);
    // The viewport can change as round UI clears. Verify the returned overview
    // contains both complete towers instead of requiring its former zoom.
    await assertFramed(screen, floors as FeatureCollection);
    expect(errors).toEqual([]);
  } finally { await Promise.all([desktop, mobile, second].map((c) => c.close())); }
});

test("missing skyline and dossiers preserve the flat field and touch controls", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await context.route(/\/(floors|city)\.geojson$|\/api\/buildings(?:\/[^/?]+)?$/, (r) => r.fulfill({ contentType: "application/json", body: "null" }));
  const screen = await context.newPage();
  const errors: string[] = [];
  screen.on("pageerror", (e) => errors.push(e.message));
  try {
    await screen.goto(`${baseURL}/screen`);
    await expect(screen.getByTestId("field")).toBeVisible();
    await expect(screen.getByRole("alert")).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
