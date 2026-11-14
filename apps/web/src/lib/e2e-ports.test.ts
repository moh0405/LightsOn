import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("uses the configured API and web ports in both Playwright configurations", async () => {
  vi.stubEnv("LO_E2E_API_PORT", "18101");
  vi.stubEnv("LO_E2E_WEB_PORT", "15274");
  for (const config of [(await import("../../playwright.config")).default, (await import("../../e2e/qa-phase2.config")).default]) {
    expect(config.use?.baseURL).toBe("http://127.0.0.1:15274");
    const servers = config.webServer;
    if (!Array.isArray(servers)) throw new Error("Expected API and web servers");
    expect(servers[0]?.command).toContain("--port 18101");
    expect(servers[0]?.url).toBe("http://127.0.0.1:18101/api/health");
    expect(servers[1]?.command).toContain("--port 15274");
    expect(servers[1]?.url).toBe("http://127.0.0.1:15274");
    expect(servers[1]?.env?.API_PROXY_TARGET).toBe("http://127.0.0.1:18101");
  }
});
