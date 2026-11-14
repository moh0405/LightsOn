import { describe, expect, it } from "vitest";
import { initialGame, reduce, useHealthStore } from "./store";
import type { RoomStateMsg } from "./protocol";

const state: RoomStateMsg = {
  type: "room_state", room: "ABCD", phase: "EXPLORE", round_id: null, building_id: null, target_floors: [],
  ends_at: null, data_mode: "kit", data_mode_scope: "process", hero_building_ids: ["233953"],
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
    expect(patch.dataModeScope).toBe("process");
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

describe("round events", () => {
  const city = { buildings_revived: 0, sqft_reimagined: 0, song_layers: 0, needs: { housing: 40, food_retail: 30, entertainment: 15, community: 35 }, most_needed: "entertainment" as const };
  it("stores intro, pitches, challenges and authoritative verdicts", () => {
    const intro = { type: "building_intro" as const, text: "Hello", audio_url: null, mood: "hopeful", analyst_line: null };
    expect(reduce(initialGame, intro).intro).toEqual(intro);
    const pitch = { type: "pitch_received" as const, player_id: "p1", text: "A community art space", origin: "web" as const };
    const first = { ...initialGame, ...reduce(initialGame, pitch) };
    expect(reduce(first, { ...pitch, text: "A public art space" }).pitches?.p1?.text).toBe("A public art space");
    const offer = { type: "counteroffer" as const, player_id: "p1", line: "Tell me more", counteroffer: "Who can join?", fact_ids: [], audio_url: null };
    expect(reduce(first, offer).counteroffers?.p1).toEqual(offer);
    const verdict = { type: "verdict" as const, round_id: "R1", winner_player_id: "p1", scores: [], reason_line: "I'm in.", fact_ids: [], category: "culture" as const, desire_met: false, desire_reveal: "", impact: null };
    expect(reduce(first, verdict).verdict).toEqual(verdict);
    expect(reduce(first, { type: "energy_updated", charge: 25, by_player_id: "p1" }).charge).toBe(25);
  });
  it("revives once, preserves source state and restores the city from a snapshot", () => {
    const event = { type: "building_revived" as const, building_id: "233953", floors: [6, 7, 8], color: "#00ffff", category: "culture" as const, sqft: 94509, auto_completed: false };
    const before = { ...initialGame, city };
    const after = { ...before, ...reduce(before, event, 123) };
    expect(before.revivedColors).toEqual({});
    expect(after.revival?.at).toBe(123);
    expect(after.city).toMatchObject({ buildings_revived: 1, sqft_reimagined: 94509, song_layers: 1 });
    expect(reduce(after, event)).toEqual({});
    const next = reduce(after, { ...event, floors: [17, 18], color: "#ff55bb", sqft: 33060 }, 456);
    expect(next.revivedColors?.["233953"]).toEqual({ floors: [6, 7, 8, 17, 18], color: "#ff55bb" });
    expect(next.city).toMatchObject({ buildings_revived: 1, sqft_reimagined: 127569, song_layers: 2 });
    const snapshot = reduce(after, { ...state, revived: after.revivedColors, city: after.city!, charge: 100,
      pitches: [{ player_id: "p1", text: "An art space", origin: "web", at: "2026-11-13T22:00:00Z" }],
      revisions: [{ player_id: "p1", text: "An open art space", origin: "web", revision: true, at: "2026-11-13T22:01:00Z" }],
      challenges: [{ player_id: "p1", line: "Tell me more", counteroffer: "Who can join?", fact_ids: [], category_guess: "culture" }],
    });
    expect(snapshot.charge).toBe(100);
    expect(snapshot.pitches?.p1?.text).toBe("An open art space");
    expect(snapshot.counteroffers?.p1?.counteroffer).toBe("Who can join?");
    expect(snapshot.revivedColors).toEqual(after.revivedColors);
    expect(snapshot.city).toEqual(after.city);
    expect(snapshot.revival).toBeNull();
    expect(reduce(after, { type: "neighborhood_updated", needs: { ...city.needs, entertainment: 45 }, most_needed: "food_retail" }).city?.needs.entertainment).toBe(45);
  });
  it("clears old round dialogue on reset and errors when a new round starts", () => {
    const stale = { ...initialGame, charge: 75, lastError: { code: "no_pitches", message: "Round skipped" } };
    expect(reduce(stale, { type: "round_started", round_id: "r", building_id: "233953", target_floors: [6] })).toMatchObject({ charge: 0, lastError: null, pitches: {}, counteroffers: {} });
    const reset = { ...stale, ...reduce(stale, { type: "phase_changed", round_id: null, phase: "EXPLORE", ends_at: null }) };
    expect(reset.charge).toBe(0);
    expect(reset.lastError?.code).toBe("no_pitches");
  });
});
