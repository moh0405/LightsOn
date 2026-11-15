import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Real kit, real cached media, unscaled timers; fake agent prevents Bedrock calls.
export default defineConfig({
  ...base,
  testDir: "./e2e/final",
  testMatch: "verification.ts",
  timeout: 180_000,
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map((server, i) => i === 0
    ? { ...server, env: { ...server.env, PHASE_DURATIONS_SCALE: "1", DEMO_MODE: process.env.DEMO_MODE ?? "0" } }
    : server),
});
