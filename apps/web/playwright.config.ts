import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Config can be evaluated again in workers; reuse the directory for this run.
const stateDir = process.env.LO_E2E_STATE_DIR ?? mkdtempSync(join(tmpdir(), "lights-on-e2e-"));
process.env.LO_E2E_STATE_DIR = stateDir;

export default defineConfig({
  testDir: "./e2e",
  // Keep traces outside the checkout and preserve them after snapshot cleanup.
  outputDir: `${stateDir}-artifacts`,
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  globalTeardown: "./e2e/teardown.ts",
  use: { baseURL: "http://127.0.0.1:15174", trace: "retain-on-failure", launchOptions: { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] } },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "uv run uvicorn app.main:app --host 127.0.0.1 --port 18001",
      cwd: "../../server",
      url: "http://127.0.0.1:18001/api/health",
      reuseExistingServer: false,
      env: { STATE_DIR: stateDir, HOST_PIN: "1234", PHASE_DURATIONS_SCALE: "0.1", PUBLIC_BASE_URL: "", DATA_MODE: "kit" },
    },
    {
      command: "pnpm dev --host 127.0.0.1 --port 15174 --strictPort",
      url: "http://127.0.0.1:15174",
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: "http://127.0.0.1:18001" },
    },
  ],
});
