import { describe, expect, it } from "vitest";
import { initialGame, reduce, useHealthStore } from "./store";
import type { RoomStateMsg } from "./protocol";

const state: RoomStateMsg = {
  type: "room_state", room: "ABCD", phase: "EXPLORE", round_id: null, building_id: null, target_floors: [],
  ends_at: null, data_mode: "kit", hero_building_ids: ["233953"],
  players: [{ id: "p1", nickname: "Ann", color: "#f00", connected: true }],
};

describe("health store", () => {
  it("starts in loading state", () => {
    expect(useHealthStore.getState().status).toBe("loading");
  });
});

describe("game reducer", () => {
  it("room_state replaces the snapshot (reconnect restores everything)", () => {
    const stale = { ...initialGame, phase: "LOBBY" as const, pointers: { x: { x: 0, y: 0, color: "#000", at: 1 } } };
    const patch = reduce(stale, state);
    expect(patch.phase).toBe("EXPLORE");
    expect(patch.players?.p1?.nickname).toBe("Ann");
    expect(patch.pointers).toEqual({});
    expect(patch.hasState).toBe(true);
  });

  it("pointer events update the colored dot", () => {
    const patch = reduce(initialGame, { type: "pointer", player_id: "p1", color: "#f00", x: 0.1, y: 0.9 }, 42);
    expect(patch.pointers?.p1).toEqual({ x: 0.1, y: 0.9, color: "#f00", at: 42 });
  });

  it("phase_changed updates phase and timer", () => {
    const patch = reduce(initialGame, { type: "phase_changed", round_id: "R-1", phase: "PITCH", ends_at: "2026-01-01T00:00:00Z" });
    expect(patch).toMatchObject({ phase: "PITCH", roundId: "R-1", endsAt: "2026-01-01T00:00:00Z" });
  });

  it("player_left keeps the player but marks them offline", () => {
    const s = { ...initialGame, ...reduce(initialGame, state) };
    const patch = reduce(s, { type: "player_left", player: { id: "p1", nickname: "Ann", color: "#f00", connected: false } });
    expect(patch.players?.p1?.connected).toBe(false);
  });

  it("only un-nonced errors become toasts", () => {
    expect(reduce(initialGame, { type: "error", code: "x", message: "m", nonce: "n1" })).toEqual({});
    expect(reduce(initialGame, { type: "error", code: "x", message: "m" }).lastError?.message).toBe("m");
  });
});
