import { expect, test } from "@playwright/test";
import { silence } from "./silence";

test("Esperson pointer nickname stays outside the projected tower at 1080p", async ({ browser, baseURL }, testInfo) => {
  const desktop = await silence(await browser.newContext({ viewport: { width: 1920, height: 1080 } }));
  const second = await silence(await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }));
  const mobile = await silence(await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }));
  try {
    const screen = await desktop.newPage(), phone = await mobile.newPage();
    await screen.goto(`${baseURL}/screen`);
    const join = (await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
    await phone.goto(join);
    await phone.getByLabel("Nickname").fill("Maya");
    await phone.getByRole("button", { name: "Join", exact: true }).tap();
    const other = await second.newPage();
    await other.goto(join);
    await other.getByLabel("Nickname").fill("Leo");
    await other.getByRole("button", { name: "Join", exact: true }).tap();
    await expect(screen.getByTestId("phase")).toContainText("EXPLORE");
    await expect.poll(() => screen.evaluate(() => !!window.__lightsOnMap?.getLayer("floors"))).toBe(true);
    await expect.poll(() => screen.evaluate(() => !window.__lightsOnMap!.isMoving())).toBe(true);
    const hit = await screen.evaluate(() => {
      const map = window.__lightsOnMap!, canvas = map.getCanvas();
      for (let y = 40; y < canvas.clientHeight - 40; y += 7) for (let x = 40; x < canvas.clientWidth - 40; x += 7) {
        if (String(map.queryRenderedFeatures([x, y], { layers: ["floors"] })[0]?.properties?.building_id) === "233953") return { x: x / canvas.clientWidth, y: y / canvas.clientHeight };
      }
      throw new Error("Esperson not rendered");
    });
    const pad = (await phone.getByTestId("trackpad").boundingBox())!;
    await phone.touchscreen.tap(pad.x + pad.width * hit.x, pad.y + pad.height * hit.y);
    await expect(screen.getByTestId("hover-card")).toContainText("Esperson");
    const nickname = screen.getByTestId("pointer-label");
    await expect(nickname).toHaveText("Maya");
    // Independently project every exported floor vertex at ground and roof height.
    const tower = await screen.evaluate(async () => {
      const map = window.__lightsOnMap!, source = map.getSource("floors");
      if (!source || source.type !== "geojson") throw new Error("Missing floors");
      const floors = await source.getData();
      if (floors.type !== "FeatureCollection") throw new Error("Missing features");
      const matrix = map._camera.transform.getProjectionDataForCustomLayer(true).mainMatrix;
      const canvas = map.getCanvas(), origin = canvas.getBoundingClientRect(), points: number[][] = [];
      for (const f of floors.features.filter(f => String(f.properties?.building_id) === "233953")) {
        const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
        for (const polygon of polygons) for (const p of polygon[0] ?? []) for (const z of [0, Number(f.properties?.height_m)]) {
          const lat = p[1]! * Math.PI / 180;
          const v = [(p[0]! + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2, z / (40075016.68557849 * Math.cos(lat)), 1];
          const out = [0, 1, 2, 3].map(row => v.reduce((sum, n, col) => sum + n * matrix[col * 4 + row]!, 0));
          points.push([origin.x + (out[0]! / out[3]! + 1) * canvas.clientWidth / 2, origin.y + (1 - out[1]! / out[3]!) * canvas.clientHeight / 2]);
        }
      }
      if (!points.length) throw new Error("Missing Esperson geometry");
      return { left: Math.min(...points.map(p => p[0]!)), right: Math.max(...points.map(p => p[0]!)), top: Math.min(...points.map(p => p[1]!)), bottom: Math.max(...points.map(p => p[1]!)) };
    });
    const label = (await nickname.boundingBox())!;
    expect(label.x >= tower.right || label.x + label.width <= tower.left || label.y >= tower.bottom || label.y + label.height <= tower.top).toBe(true);
    const dot = screen.getByTestId("dot");
    expect((await dot.boundingBox())!.width).toBeLessThanOrEqual(14);
    await expect(dot).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await screen.screenshot({ path: process.env.POINTER_SCREENSHOT ?? testInfo.outputPath("pointer-outside-esperson.png") });
  } finally { await Promise.all([desktop.close(), mobile.close(), second.close()]); }
});
