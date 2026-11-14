import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Phones reach the app through the cloudflared tunnel, so allow any host
// and proxy the API and WebSocket to the FastAPI server. Tests supply an isolated target.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8000";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ["maplibre-gl"] },
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": apiTarget,
      "/ws": { target: apiTarget, ws: true },
    },
  },
});
