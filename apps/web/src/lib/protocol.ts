import type { Phase } from "./types";

export interface PlayerView {
  id: string;
  nickname: string;
  color: string;
  connected: boolean;
}

export interface RoomStateMsg {
  type: "room_state";
  room: string;
  phase: Phase;
  round_id: string | null;
  building_id: string | null;
  target_floors: number[];
  ends_at: string | null;
  data_mode: string;
  hero_building_ids: string[];
  players: PlayerView[];
}

export type ServerMessage =
  | RoomStateMsg
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
