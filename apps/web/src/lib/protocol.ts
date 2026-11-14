import type { Category, Challenge, Phase, Pitch, Verdict } from "./types";

export interface PlayerView {
  id: string;
  nickname: string;
  color: string;
  connected: boolean;
}

export type FloorStates = Record<string, Record<string, { source_status: "dark" | "partial" | "occupied" | "unknown"; game_status: "revived"; color: string }>>;
export type Need = "housing" | "food_retail" | "entertainment" | "community";
export type Needs = Record<Need, number>;
export interface CityState {
  buildings_revived: number; sqft_reimagined: number; needs: Needs;
  most_needed: Need; song_layers: number;
}
export interface Intro { text: string; audio_url: string | null; mood: string; analyst_line: string | null }
export interface PitchView { player_id: string; text: string; origin: "web" | "voice" | "imessage" }
export interface Counteroffer { player_id: string; line: string; fact_ids: string[]; counteroffer: string; audio_url: string | null }
export interface Revival { building_id: string; floors: number[]; color: string; category: Category; sqft: number; auto_completed: boolean }

export interface RoomStateMsg {
  type: "room_state";
  room: string;
  phase: Phase;
  round_id: string | null;
  building_id: string | null;
  target_floors: number[];
  ends_at: string | null;
  data_mode: string;
  data_mode_scope: "process";
  hero_building_ids: string[];
  players: PlayerView[];
  city?: CityState;
  pitches?: Pitch[];
  revisions?: Pitch[];
  challenges?: Challenge[];
  verdict?: Verdict | null;
  charge?: number;
  revived?: Record<string, { floors: number[]; color: string }>;
  floor_states?: FloorStates;
}

export type ServerMessage =
  | RoomStateMsg
  | ({ type: "building_intro" } & Intro)
  | ({ type: "pitch_received" } & PitchView)
  | ({ type: "counteroffer" } & Counteroffer)
  | ({ type: "verdict" } & Verdict)
  | { type: "energy_updated"; charge: number; by_player_id: string | null }
  | ({ type: "building_revived" } & Revival)
  | { type: "neighborhood_updated"; needs: Needs; most_needed: Need }
  | { type: "player_joined"; player: PlayerView }
  | { type: "player_left"; player: PlayerView }
  | { type: "pointer"; player_id: string; color: string; x: number; y: number }
  | { type: "phase_changed"; round_id: string | null; phase: Phase; ends_at: string | null }
  | { type: "round_started"; round_id: string; building_id: string; target_floors: number[] }
  | { type: "ack"; nonce: string; command: string; result: Record<string, unknown> }
  | { type: "error"; code: string; message: string; nonce?: string | null };

export interface PointerView {
  x: number;
  y: number;
  color: string;
  at: number;
}
