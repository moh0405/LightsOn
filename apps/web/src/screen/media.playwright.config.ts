import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import base from "../../playwright.config";
// Keep Task 6B's extra checks inside the files it owns while also running the
// complete existing suite. Ports are set explicitly by the invocation.
export default defineConfig({
  ...base,
  testDir: "../..",
  testMatch: ["e2e/**/*.spec.ts", "src/screen/media.e2e.ts"],
  globalTeardown: fileURLToPath(new URL("../../e2e/teardown.ts", import.meta.url)),
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map((server, i) => ({
    ...server,
    cwd: fileURLToPath(new URL(i === 0 ? "../../../../server" : "../..", import.meta.url)),
  })),
});
