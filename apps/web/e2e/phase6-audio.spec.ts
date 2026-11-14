import { devices, expect, test } from "@playwright/test";
import { mockSkyline } from "./skyline-data";

for (const mode of ["kit", "fixtures"] as const) {
  for (const voice of ["denied", "browser", "recorded"] as const) {
    test(`Phase 6 audio fallback round (${mode}, ${voice})`, async ({ browser, baseURL }) => {
      const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const mobile = await browser.newContext({ ...devices["iPhone 13"] });
      const second = await browser.newContext({ ...devices["iPhone 13"] });
      const errors: string[] = [];
      try {
        await Promise.all([desktop, mobile, second].map(mockSkyline));
        await desktop.addInitScript(() => {
          Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
          Object.defineProperty(window, "SpeechSynthesisUtterance", { value: undefined, configurable: true });
        });
        await mobile.addInitScript((path) => {
          Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
          Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
          if (path === "browser") {
            class FakeRecognition {
              onresult: ((event: unknown) => void) | null = null;
              onend: (() => void) | null = null;
              start() { this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "A public community gaming studio open at night" } }] }); }
              stop() { this.onend?.(); }
              abort() { this.onend?.(); }
            }
            Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true });
          }
          if (path === "recorded") {
            class FakeRecorder {
              state = "inactive"; mimeType = "audio/webm";
              ondataavailable: ((event: { data: Blob }) => void) | null = null;
              onstop: (() => void) | null = null;
              start() { this.state = "recording"; }
              stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["fake audio"], { type: this.mimeType }) }); this.onstop?.(); }
            }
            Object.defineProperty(window, "MediaRecorder", { value: FakeRecorder, configurable: true });
            Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) }, configurable: true });
          } else {
            Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => { throw new Error("permission denied"); } }, configurable: true });
          }
        }, voice);
        // The provider is intentionally unavailable; typed recovery must still finish the round.
        await mobile.route("**/pitch_audio", (r) => r.fulfill({ status: 503, json: { detail: { code: "stt_unavailable" } } }));
        const screen = await desktop.newPage();
        for (const page of [screen]) {
          page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
          page.on("pageerror", (error) => errors.push(error.message));
        }
        await screen.goto(`${baseURL}/screen`);
        await expect(screen.getByTestId("qr")).toBeVisible();
        await screen.getByRole("button", { name: "Start audio", exact: true }).click();
        await expect(screen.getByRole("button", { name: "Start audio", exact: true })).toHaveCount(0);
        const join = (await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
        const admin = await desktop.newPage();
        await admin.goto(`${baseURL}/admin`);
        await admin.getByLabel("Host PIN").fill("1234");
        await admin.getByRole("button", { name: `Data: ${mode}`, exact: true }).click();
        await expect(admin.getByText(new RegExp(`data mode: ${mode}`))).toBeVisible();
        const phone = await mobile.newPage();
        const other = await second.newPage();
        for (const [page, name] of [[phone, "Ann"], [other, "Bo"]] as const) {
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(join);
          await page.getByLabel("Nickname").fill(name);
          await page.getByRole("button", { name: "Join", exact: true }).tap();
        }
        await phone.getByRole("button", { name: "Wake building Esperson", exact: true }).tap();
        await expect(screen.getByTestId("subtitles")).toBeVisible();
        await expect(screen.getByTestId("phase")).toContainText("PITCH");
        await phone.getByRole("button", { name: "Hold to talk", exact: true }).tap();
        if (voice === "browser") await expect(phone.getByLabel("Your pitch")).toHaveValue("A public community gaming studio open at night");
        else {
          await expect(phone.getByRole("alert")).toContainText(/Type|type/);
          await phone.getByLabel("Your pitch").fill("A public community gaming studio open at night");
        }
        await phone.getByRole("button", { name: "Submit pitch", exact: true }).tap();
        await other.getByLabel("Your pitch").fill("A shared food market");
        await other.getByRole("button", { name: "Submit pitch", exact: true }).tap();
        await expect(screen.getByTestId("phase")).toContainText("NEGOTIATE", { timeout: 10_000 });
        await expect(screen.getByRole("region", { name: "Building counteroffers" })).toBeVisible();
        await phone.getByLabel("Your revision").fill("A public community gaming studio welcoming everyone at night");
        await phone.getByRole("button", { name: "Send revision", exact: true }).tap();
        await expect(screen.getByTestId("score-card")).toBeVisible();
        await expect(screen.getByTestId("phase")).toContainText("POWER_UP");
        await phone.getByRole("button", { name: "Tap to charge", exact: true }).tap();
        await other.getByRole("button", { name: "Tap to charge", exact: true }).tap();
        await expect(screen.getByTestId("phase")).toContainText("REVIVED");
        await expect(screen.getByTestId("city-meter")).toContainText("1 buildings revived");
        if (mode === "kit" && voice === "denied") await screen.screenshot({ path: "e2e/screenshots/phase6/audio-unavailable-revived.png" });
        expect(errors).toEqual([]);
      } finally { await Promise.all([desktop, mobile, second].map((context) => context.close())); }
    });
  }
}
