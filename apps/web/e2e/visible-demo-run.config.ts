import { defineConfig } from '@playwright/test';
// Deliberately no webServer, retries, clock changes, or audio silencing.
export default defineConfig({
  testDir: '.', testMatch: 'visible-demo-run.spec.ts', workers: 1, retries: 0,
  timeout: 360_000, reporter: 'list', outputDir: '/tmp/lights-visible-run/artifacts',
  use: { baseURL: 'http://localhost:5173', headless: false, trace: 'off', video: 'off' },
});
