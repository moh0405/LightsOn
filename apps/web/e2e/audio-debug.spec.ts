import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { mockSkyline } from "./skyline-data";

test("native speech timeline through a two-player round", async ({ browser, baseURL }, info) => {
  test.setTimeout(120_000);
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const [desktop, mobile, second] = contexts;
  try {
    await Promise.all(contexts.map(mockSkyline));
    await desktop!.addInitScript(() => {
      const events: unknown[] = [];
      Object.assign(window, { audioTimeline: events });
      const log = (event: string, data: object = {}) => events.push({ ms: Math.round(performance.now()), event, ...data });
      Object.assign(window, { logAudio: log });
      for (const method of ["speak", "cancel", "pause", "resume"] as const) {
        const original = speechSynthesis[method].bind(speechSynthesis);
        Object.defineProperty(speechSynthesis, method, { value: (utterance?: SpeechSynthesisUtterance) => {
          log(method, { stack: new Error().stack, text: utterance?.text, voice: utterance?.voice?.name ?? "browser default", rate: utterance?.rate, pitch: utterance?.pitch,
            speaking: speechSynthesis.speaking, pending: speechSynthesis.pending });
          if (utterance) for (const event of ["start", "end", "error"] as const) utterance.addEventListener(event, (e) => log(event, { text: utterance.text, error: "error" in e ? e.error : undefined }));
          if (method === "speak") (original as (u: SpeechSynthesisUtterance) => void)(utterance!); else (original as () => void)();
        } });
      }
      speechSynthesis.addEventListener("voiceschanged", () => log("voiceschanged", { voices: speechSynthesis.getVoices().map(v => v.name) }));
      document.addEventListener("click", () => log("click"), { once: true });
    });
    const screen = await desktop!.newPage();
    const errors: string[] = [];
    screen.on("pageerror", error => errors.push(error.message));
    screen.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await screen.goto(`${baseURL}/screen`);
    await screen.evaluate(async () => {
      // @ts-expect-error Vite serves source modules in the browser.
      const { CityMusic } = await import("/src/screen/music.ts");
      // @ts-expect-error Vite serves source modules in the browser.
      const { useGame } = await import("/src/lib/store.ts");
      const log = Reflect.get(window, "logAudio") as (event: string, data?: object) => void;
      const start = CityMusic.prototype.start;
      CityMusic.prototype.start = async function () {
        await start.call(this);
        const context = this.tone.getContext();
        log("AudioContext", { state: context.state });
        context.on("statechange", () => log("AudioContext", { state: context.state }));
      };
      const duck = CityMusic.prototype.duck;
      CityMusic.prototype.duck = function (speaking: boolean) { log("duck", { speaking }); return duck.call(this, speaking); };
      useGame.subscribe((state: { phase: string }, previous: { phase: string }) => { if (state.phase !== previous.phase) log("phase", { phase: state.phase }); });
    });
    await expect(screen.getByTestId("qr")).toBeVisible();
    await screen.getByRole("button", { name: "Start audio", exact: true }).click();
    await expect(screen.getByRole("button", { name: "Start audio", exact: true })).toHaveCount(0);
    const join = (await screen.locator("aside p").filter({ hasText: "/play?room=" }).innerText()).trim();
    const phone = await mobile!.newPage(), other = await second!.newPage();
    for (const [page, name] of [[phone, "Ann"], [other, "Bo"]] as const) {
      await page.goto(join); await page.getByLabel("Nickname").fill(name); await page.getByRole("button", { name: "Join", exact: true }).click();
    }
    await phone.getByRole("button", { name: "Wake building Esperson", exact: true }).click();
    await expect(screen.getByTestId("phase")).toContainText("PITCH", { timeout: 30_000 });
    for (const page of [phone, other]) {
      await page.getByLabel("Your pitch").fill("A public community gaming studio open at night");
      await page.getByRole("button", { name: "Submit pitch", exact: true }).click();
    }
    await expect(screen.getByTestId("phase")).toContainText("NEGOTIATE", { timeout: 40_000 });
    await phone.getByLabel("Your revision").fill("A public community gaming studio welcoming everyone at night");
    await phone.getByRole("button", { name: "Send revision", exact: true }).click();
    await expect(screen.getByTestId("phase")).toContainText("POWER_UP", { timeout: 40_000 });
    for (const page of [phone, other]) await page.getByRole("button", { name: "Tap to charge", exact: true }).click();
    await expect(screen.getByTestId("phase")).toContainText("REVIVED", { timeout: 15_000 });
    await screen.waitForTimeout(2500);
    const timeline = await screen.evaluate(() => Reflect.get(window, "audioTimeline"));
    const path = info.outputPath("audio-timeline.json");
    writeFileSync(path, JSON.stringify(timeline, null, 2));
    await info.attach("audio-timeline", { path, contentType: "application/json" });
    if (process.env.AUDIO_TIMELINE_PATH) writeFileSync(process.env.AUDIO_TIMELINE_PATH, JSON.stringify(timeline, null, 2));
    expect(errors).toEqual([]);
    if (process.env.AUDIO_ASSERT_NATIVE) {
      const events = timeline as { event: string; text?: string; speaking?: boolean }[];
      expect(events.filter(e => e.event === "error" || e.event === "cancel")).toEqual([]);
      const speak = events.filter(e => e.event === "speak");
      expect(speak.length).toBeGreaterThanOrEqual(4);
      expect(events.filter(e => e.event === "end").map(e => e.text)).toEqual(speak.map(e => e.text));
      let ducked = false, active = false;
      for (const event of events) {
        if (event.event === "duck") ducked = !!event.speaking;
        if (event.event === "start") { expect(ducked).toBe(true); expect(active).toBe(false); active = true; }
        if (event.event === "end") active = false;
      }
      expect(ducked).toBe(false);
    }
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

test("Start gates speech; replayed lines speak once and verdict survives POWER_UP", async ({ page }) => {
  await mockSkyline(page.context());
  await page.route("**/api/tts", route => route.fulfill({ json: { audio_url: null } }));
  await page.addInitScript(() => {
    const spoken: string[] = [];
    Object.assign(window, { spoken });
    const synth = new EventTarget();
    Object.assign(synth, {
      getVoices: () => [{ name: "Samantha", lang: "en-US", default: true }],
      cancel: () => spoken.push("CANCEL"),
      speak: (utterance: SpeechSynthesisUtterance) => {
        spoken.push(utterance.text);
        Object.assign(window, { finishSpeech: () => utterance.onend?.({ utterance } as SpeechSynthesisEvent) });
      },
    });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth });
    // Use a JS utterance: the mock voice is intentionally not a native voice object.
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class {
      text: string; constructor(text: string) { this.text = text; }
    } });
  });
  await page.goto("/screen");
  await expect(page.getByTestId("qr")).toBeVisible();
  await page.evaluate(async () => {
    // @ts-expect-error Vite browser import.
    const { useGame } = await import("/src/lib/store.ts");
    useGame.setState({ phase: "INTRO", roundId: "audio-test", intro: { text: "Thank you.", audio_url: null, mood: "proud", analyst_line: "" } });
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => Reflect.get(window, "spoken"))).toEqual([]);
  await page.getByRole("button", { name: "Start audio", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "spoken"))).toEqual(["Thank you."]);
  await page.evaluate(() => Reflect.get(window, "finishSpeech")());
  await page.evaluate(async () => {
    // @ts-expect-error Vite browser import.
    const { useGame } = await import("/src/lib/store.ts");
    useGame.setState({ intro: structuredClone(useGame.getState().intro) });
  });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => Reflect.get(window, "spoken"))).toEqual(["Thank you."]);
  await page.evaluate(async () => {
    // @ts-expect-error Vite browser import.
    const { useGame } = await import("/src/lib/store.ts");
    useGame.setState({ phase: "VERDICT", verdict: { reason_line: "Welcome. Please join us.", category: "community", winner_player_id: "ann", scores: [], fact_ids: [], desire_reveal: "", impact: null } });
  });
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "spoken"))).toEqual(["Thank you.", "Welcome."]);
  await page.evaluate(async () => {
    // @ts-expect-error Vite browser import.
    const { useGame } = await import("/src/lib/store.ts");
    useGame.setState({ phase: "POWER_UP" });
    Reflect.get(window, "finishSpeech")();
  });
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "spoken"))).toEqual(["Thank you.", "Welcome.", "Please join us."]);
  await page.evaluate(() => Reflect.get(window, "finishSpeech")());
});
