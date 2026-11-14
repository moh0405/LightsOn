import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Phones reach the app through the cloudflared tunnel, so allow any host
// and proxy the API and WebSocket to the FastAPI server.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
});
