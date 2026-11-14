// Separate ports let the QA worker run alongside another workspace's suite.
import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../playwright.config';

export default defineConfig({
  ...base,
  testDir: import.meta.dirname,
  globalTeardown: resolve(import.meta.dirname, 'teardown.ts'),
  use: { ...base.use, baseURL: 'http://127.0.0.1:15176' },
  webServer: [
    {
      command: 'uv run --python 3.11 uvicorn app.main:app --host 127.0.0.1 --port 18003',
      cwd: resolve(import.meta.dirname, '../../../server'),
      url: 'http://127.0.0.1:18003/api/health',
      env: { STATE_DIR: process.env.LO_E2E_STATE_DIR!, HOST_PIN: '1234', PHASE_DURATIONS_SCALE: '0.1', PUBLIC_BASE_URL: '', DATA_MODE: 'kit' },
    },
    {
      command: 'pnpm dev --host 127.0.0.1 --port 15176 --strictPort',
      cwd: resolve(import.meta.dirname, '..'),
      url: 'http://127.0.0.1:15176',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:18003' },
    },
  ],
});
