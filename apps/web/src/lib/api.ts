export interface Health {
  ok: boolean;
  data_mode: string;
  demo_mode?: boolean;
  keys: Record<string, boolean>;
  costar_property_file: boolean;
}

export async function fetchHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health ${res.status}`);
  return (await res.json()) as Health;
}

export interface CreatedRoom {
  room: string;
  join_url: string;
  qr_svg: string;
}

/** Create a room, or reuse `room` if the server still has it. */
export async function createRoom(room?: string | null): Promise<CreatedRoom> {
  const res = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room: room ?? null, base_url: location.origin }),
  });
  if (!res.ok) throw new Error(`rooms ${res.status}`);
  return (await res.json()) as CreatedRoom;
}
