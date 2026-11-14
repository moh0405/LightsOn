import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { restoreRevivedColors, withRevivedBuilding, type RevivedColors } from "./floor-colors";
import { setBuildingDataMode } from "./buildings";
import { fetchHealth } from "./api";
import type { CityState, Counteroffer, Intro, PitchView, PlayerView, PointerView, Revival, ServerMessage } from "./protocol";
import type { Phase, Verdict } from "./types";
import { RoomSocket, type ConnStatus } from "./ws";

// ---- health (Phase 0) ------------------------------------------------
export interface HealthState {
  status: "loading" | "ok" | "down";
  dataMode: string | null;
  load: () => Promise<void>;
}

export const useHealthStore = create<HealthState>((set) => ({
  status: "loading",
  dataMode: null,
  load: async () => {
    try {
      const h = await fetchHealth();
      set({ status: h.ok ? "ok" : "down", dataMode: h.data_mode });
    } catch {
      set({ status: "down", dataMode: null });
    }
  },
}));

export function useHealth(): HealthState {
  const state = useHealthStore();
  useEffect(() => {
    void state.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

// ---- game state (fed by the WebSocket) ---------------------------------
export interface GameState {
  conn: ConnStatus;
  room: string | null;
  phase: Phase;
  roundId: string | null;
  buildingId: string | null;
  endsAt: string | null;
  dataMode: string;
  dataModeScope: "process";
  heroIds: string[];
  players: Record<string, PlayerView>;
  pointers: Record<string, PointerView>;
  revivedColors: RevivedColors;
  intro: Intro | null;
  pitches: Record<string, PitchView>;
  counteroffers: Record<string, Counteroffer>;
  verdict: Verdict | null;
  charge: number;
  revival: (Revival & { at: number }) | null;
  city: CityState | null;
  hasState: boolean;
  lastError: { code: string; message: string } | null;
}

export const initialGame: GameState = {
  conn: "closed",
  room: null,
  phase: "LOBBY",
  roundId: null,
  buildingId: null,
  endsAt: null,
  dataMode: "kit",
  dataModeScope: "process",
  heroIds: [],
  players: {},
  pointers: {},
  revivedColors: {},
  intro: null, pitches: {}, counteroffers: {}, verdict: null, charge: 0, revival: null, city: null,
  hasState: false,
  lastError: null,
};

/** Pure reducer: server message in, state patch out. */
export function reduce(s: GameState, msg: ServerMessage, now = Date.now()): Partial<GameState> {
  switch (msg.type) {
    case "room_state":
      return {
        hasState: true,
        room: msg.room,
        phase: msg.phase,
        roundId: msg.round_id,
        buildingId: msg.building_id,
        endsAt: msg.ends_at,
        dataMode: msg.data_mode,
        dataModeScope: msg.data_mode_scope,
        heroIds: msg.hero_building_ids,
        players: Object.fromEntries(msg.players.map((p) => [p.id, p])),
        pointers: {},
        revivedColors: restoreRevivedColors(msg.revived ?? {}, msg.floor_states), city: msg.city ?? null,
        intro: msg.intro ?? null,
        pitches: Object.fromEntries([...(msg.pitches ?? []), ...(msg.revisions ?? [])].map((p) => [p.player_id, p])),
        counteroffers: Object.fromEntries((msg.challenges ?? []).map((c) => [c.player_id, { ...c, audio_url: null }])),
        verdict: msg.verdict ?? null, charge: msg.charge ?? 0, revival: null, lastError: null,
      };
    case "player_joined":
    case "player_left":
      return { players: { ...s.players, [msg.player.id]: msg.player } };
    case "pointer":
      return { pointers: { ...s.pointers, [msg.player_id]: { x: msg.x, y: msg.y, color: msg.color, at: now } } };
    case "phase_changed":
      return {
        ...(msg.round_id ? {} : { intro: null, pitches: {}, counteroffers: {}, verdict: null, charge: 0, revival: null }),
        phase: msg.phase,
        roundId: msg.round_id,
        endsAt: msg.ends_at,
        buildingId: msg.round_id ? s.buildingId : null,
        pointers: msg.phase === "EXPLORE" ? s.pointers : {},
      };
    case "round_started":
      return { roundId: msg.round_id, buildingId: msg.building_id, intro: null, pitches: {}, counteroffers: {}, verdict: null, charge: 0, revival: null, lastError: null };
    case "building_intro": return { intro: msg };
    case "pitch_received": return { pitches: { ...s.pitches, [msg.player_id]: msg } };
    case "counteroffer": return { counteroffers: { ...s.counteroffers, [msg.player_id]: msg } };
    case "verdict": return { verdict: msg };
    case "energy_updated": return { charge: msg.charge };
    case "building_revived": {
      const previous = s.revivedColors[msg.building_id];
      if (previous && msg.floors.every((floor) => previous.floors.includes(floor))) return {};
      const categories = s.city?.song_categories ?? [];
      const songCategories = categories.includes(msg.category) || categories.length >= 8 ? categories : [...categories, msg.category];
      return {
        charge: 100, revival: { ...msg, at: now },
        revivedColors: withRevivedBuilding(s.revivedColors, msg.building_id, msg.floors, msg.color),
        city: s.city ? { ...s.city, buildings_revived: s.city.buildings_revived + (previous ? 0 : 1),
          sqft_reimagined: s.city.sqft_reimagined + msg.sqft, song_categories: songCategories, song_layers: songCategories.length } : null,
      };
    }
    case "neighborhood_updated": return { city: s.city ? { ...s.city, needs: msg.needs, most_needed: msg.most_needed } : null };
    case "error":
      return msg.nonce ? {} : { lastError: { code: msg.code, message: msg.message } };
    default:
      return {};
  }
}

export const useGame = create<GameState>(() => ({ ...initialGame }));

/** Opens a socket for a room while mounted; returns a stable ref to it. */
export function useRoomSocket(
  room: string | null,
  role: "screen" | "play" | "admin",
  getPlayerId?: () => string | null,
): React.MutableRefObject<RoomSocket | null> {
  const ref = useRef<RoomSocket | null>(null);
  const getter = useRef(getPlayerId);
  getter.current = getPlayerId;
  useEffect(() => {
    if (!room) return;
    useGame.setState({ ...initialGame, room });
    const sock = new RoomSocket({
      room,
      role,
      getPlayerId: () => getter.current?.() ?? null,
      onMessage: (m) => {
        if (m.type === "room_state") setBuildingDataMode(m.data_mode);
        useGame.setState((s) => reduce(s, m));
      },
      onStatus: (conn) => useGame.setState({ conn }),
    });
    ref.current = sock;
    sock.connect();
    return () => {
      sock.close();
      ref.current = null;
    };
  }, [room, role]);
  return ref;
}

/** Seconds left until an ISO timestamp, ticking 4x a second. */
export function useCountdown(endsAt: string | null): number | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000));
}

export function safeGet(key: string, storage: "local" | "session" = "local"): string | null {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string, storage: "local" | "session" = "local"): void {
  try {
    (storage === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    /* private mode: the page still works without persistence */
  }
}
