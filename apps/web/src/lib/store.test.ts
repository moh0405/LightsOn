import { describe, expect, it } from "vitest";
import { useHealthStore } from "./store";

describe("health store", () => {
  it("starts in loading state", () => {
    const s = useHealthStore.getState();
    expect(s.status).toBe("loading");
    expect(s.dataMode).toBeNull();
  });
});
