import { expect, test } from "@playwright/test";
import { silence } from "./silence";
import { writeFileSync, mkdirSync } from "node:fs";
import { assertFramed } from "./camera-assertions";
import type { FeatureCollection } from "geojson";

// Performance is measured with the machine's GPU; the functional suite forces
// SwiftShader for deterministic pixel checks, which is not a projector workload.
test.use({ launchOptions: { args: process.platform === "darwin" ? ["--use-gl=angle", "--use-angle=metal", "--enable-gpu"] : ["--enable-gpu"] } });

test("1080p skyline, stable floor selection, eased dive and frame times", async ({ browser, baseURL, request }) => {
  test.setTimeout(90_000);
  const baseline = process.env.LO_VISUAL_BASELINE === "1";
  const context = await silence(await browser.newContext({ viewport: { width: 1920, height: 1080 } }));
  const errors: string[] = [];
  const dir = "e2e/screenshots/visual-polish";
  mkdirSync(dir, { recursive: true });
  try {
    const screen = await context.newPage();
    screen.on("pageerror", e => errors.push(e.message));
    screen.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await screen.goto(`${baseURL}/screen`);
    await expect(screen.getByTestId("field")).toHaveAttribute("data-facts-ready", "true");
    await expect.poll(() => screen.evaluate(() => !window.__lightsOnMap!.isMoving())).toBe(true);
    console.log("WebGL renderer", await screen.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2")!;
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      return debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unavailable";
    }));
    if (!baseline) {
      // The wakeable towers must fill the projector instead of sitting as a small cluster.
      const span = await screen.evaluate(() => {
        const map = window.__lightsOnMap!, xs: number[] = [];
        const source = map.getSource("floors")!.serialize() as { data: { features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] } };
        for (const f of source.data.features) for (const ring of (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][]) for (const p of ring[0] ?? []) xs.push(map.project([p[0]!, p[1]!]).x);
        return (Math.max(...xs) - Math.min(...xs)) / map.getCanvas().clientWidth;
      });
      expect(span).toBeGreaterThan(0.4);
      expect(await screen.evaluate(() => !!window.__lightsOnMap!.getLayer("floor-halos"))).toBe(true);
    }
    await screen.screenshot({ path: `${dir}/${baseline ? "before" : "after"}-attract.png` });
    const measure = () => screen.evaluate(() => new Promise<{ mean: number; p95: number; fps: number; renders: number }>(resolve => {
      const samples: number[] = [];
      const start = performance.now(); let previous = start, renders = 0;
      const render = () => renders++;
      window.__lightsOnMap!.on("render", render);
      const frame = (now: number) => {
        samples.push(now - previous); previous = now;
        if (now - start < 3000) requestAnimationFrame(frame);
        else {
          window.__lightsOnMap!.off("render", render);
          samples.shift(); samples.sort((a, b) => a - b);
          const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
          resolve({ mean, p95: samples[Math.floor(samples.length * 0.95)]!, fps: 1000 / mean, renders });
        }
      }; requestAnimationFrame(frame);
    }));
    const attract = await measure();
    // A06: the attract orbit must advance every frame, not in 100 ms jumps.
    const orbitSteps = await screen.evaluate(() => new Promise<number[]>(resolve => {
      const map = window.__lightsOnMap!, gaps: number[] = [];
      let bearing = map.getBearing(), changed = performance.now();
      const start = changed;
      const frame = (now: number) => {
        if (map.getBearing() !== bearing) { gaps.push(now - changed); changed = now; bearing = map.getBearing(); }
        if (now - start < 2000) requestAnimationFrame(frame); else resolve(gaps.sort((a, b) => a - b));
      }; requestAnimationFrame(frame);
    }));
    expect(orbitSteps.length).toBeGreaterThan(40);
    expect(orbitSteps[Math.floor(orbitSteps.length / 2)]!).toBeLessThan(40);
    const phone = await context.newPage();
    await phone.goto((await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim());
    await phone.getByLabel("Nickname").fill("Polish");
    await phone.getByRole("button", { name: "Join", exact: true }).click();
    const admin = await context.newPage();
    await admin.goto(`${baseURL}/admin`);
    await admin.getByLabel("Host PIN").fill("1234");
    await admin.getByRole("button", { name: "Data: kit", exact: true }).click();
    await admin.getByRole("button", { name: "Skip phase", exact: true }).click();
    await expect(screen.getByTestId("phase")).toContainText("EXPLORE");
    const hit = await screen.evaluate(() => {
      const map = window.__lightsOnMap!, canvas = map.getCanvas();
      for (let y = 80; y < canvas.clientHeight - 100; y += 4) for (let x = 100; x < canvas.clientWidth - 100; x += 4) {
        const f = map.queryRenderedFeatures([x, y], { layers: ["floors"] })[0];
        if (f?.properties?.building_id === "233953") return { x: x / canvas.clientWidth, y: y / canvas.clientHeight };
      }
      throw new Error("Esperson is not rendered");
    });
    const pad = (await phone.getByTestId("trackpad").boundingBox())!;
    await phone.mouse.click(pad.x + pad.width * hit.x, pad.y + pad.height * hit.y);
    await expect(screen.getByTestId("hover-card")).toContainText("Esperson");
    if (!baseline) {
      await expect(screen.getByTestId("hover-card")).toContainText("Wake");
      await expect(screen.getByTestId("hover-card")).toContainText("Floor");
      expect(await screen.evaluate(() => window.__lightsOnMap!.getLayer("windows"))).toBeTruthy();
    }
    await screen.screenshot({ path: `${dir}/${baseline ? "before" : "after"}-selection.png` });
    const selection = await measure();
    await phone.getByRole("button", { name: "Wake building Esperson", exact: true }).click();
    await expect(screen.getByTestId("building-label")).toHaveText("Waking Esperson");
    await screen.waitForTimeout(2700);
    await expect.poll(() => screen.evaluate(() => !window.__lightsOnMap!.isMoving())).toBe(true);
    await assertFramed(screen, await (await request.get("/floors.geojson")).json() as FeatureCollection, "233953");
    await screen.screenshot({ path: `${dir}/${baseline ? "before" : "after"}-dive.png` });
    const metrics = { attract, selection };
    writeFileSync(`${dir}/${baseline ? "before" : "after"}-frames.json`, JSON.stringify(metrics, null, 2));
    console.log("1080p frame times", JSON.stringify(metrics));
    if (errors.length) console.log("console errors", errors);
    if (!baseline) {
      expect(attract.fps).toBeGreaterThanOrEqual(50);
      expect(selection.fps).toBeGreaterThanOrEqual(50);
      expect(attract.renders / 3).toBeGreaterThanOrEqual(50);
    }
    // The embedded Matterport player occasionally logs its own network errors; they are not ours.
    expect(errors.filter(e => !e.includes("static.matterport.com"))).toEqual([]);
  } finally { await context.close(); }
});
