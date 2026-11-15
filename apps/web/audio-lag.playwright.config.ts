import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'audio-lag.spec.ts',
  timeout: 240_000,
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map((server, i) => i === 0
    ? { ...server, command: 'uv run python ../apps/web/e2e/audio-lag-server.py', env: { ...server.env, AUDIO_LAG_AGENT: process.env.AUDIO_LAG_AGENT ?? 'fake', ...(process.env.AUDIO_LAG_REALTIME ? { PHASE_DURATIONS_SCALE: '1' } : {}) } }
    : server),
});
