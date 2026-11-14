import { useHealth } from "../lib/store";

export function PlayApp() {
  const health = useHealth();
  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>Lights On: play</h1>
      <p>Placeholder phone page.</p>
      <p>Server: {health.status}{health.dataMode ? ` (data_mode: ${health.dataMode})` : ""}</p>
    </main>
  );
}
