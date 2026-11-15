import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Config can be evaluated again in workers; reuse the directory for this run.
const stateDir = process.env.LO_E2E_STATE_DIR ?? mkdtempSync(join(tmpdir(), "lights-on-e2e-"));
process.env.LO_E2E_STATE_DIR = stateDir;

const apiPort = process.env.LO_E2E_API_PORT ?? "18001";
const webPort = process.env.LO_E2E_WEB_PORT ?? "15174";
const apiURL = `http://127.0.0.1:${apiPort}`;
const webURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  // Keep traces outside the checkout and preserve them after snapshot cleanup.
  outputDir: `${stateDir}-artifacts`,
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  globalTeardown: "./e2e/teardown.ts",
  use: { baseURL: webURL, trace: "retain-on-failure", launchOptions: { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", ...(process.env.AUDIO_AUTOPLAY_DIAG ? ["--autoplay-policy=no-user-gesture-required"] : [])] } },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: `uv run uvicorn app.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: "../../server",
      url: `${apiURL}/api/health`,
      reuseExistingServer: false,
      env: { AGENT_MODE: "fake", STATE_DIR: stateDir, HOST_PIN: "1234", PHASE_DURATIONS_SCALE: process.env.PHASE_DURATIONS_SCALE ?? "0.1", PUBLIC_BASE_URL: "", DATA_MODE: "kit" },
    },
    {
      command: `pnpm dev --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webURL,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: apiURL },
    },
  ],
});
