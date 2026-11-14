// Separate ports let the QA worker run alongside another workspace's suite.
import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../playwright.config';

const apiPort = process.env.LO_E2E_API_PORT ?? '18003';
const webPort = process.env.LO_E2E_WEB_PORT ?? '15176';
const apiURL = `http://127.0.0.1:${apiPort}`;
const webURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  ...base,
  testDir: import.meta.dirname,
  globalTeardown: resolve(import.meta.dirname, 'teardown.ts'),
  use: { ...base.use, baseURL: webURL },
  webServer: [
    {
      command: `uv run --python 3.11 uvicorn app.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: resolve(import.meta.dirname, '../../../server'),
      url: `${apiURL}/api/health`,
      env: { STATE_DIR: process.env.LO_E2E_STATE_DIR!, HOST_PIN: '1234', PHASE_DURATIONS_SCALE: '0.1', PUBLIC_BASE_URL: '', DATA_MODE: 'kit' },
    },
    {
      command: `pnpm dev --host 127.0.0.1 --port ${webPort} --strictPort`,
      cwd: resolve(import.meta.dirname, '..'),
      url: webURL,
      env: { API_PROXY_TARGET: apiURL },
    },
  ],
});
