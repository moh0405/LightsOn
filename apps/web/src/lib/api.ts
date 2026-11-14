export interface Health {
  ok: boolean;
  data_mode: string;
  keys: Record<string, boolean>;
  costar_property_file: boolean;
}

export async function fetchHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health ${res.status}`);
  return (await res.json()) as Health;
}
