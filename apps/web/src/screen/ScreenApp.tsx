import { useHealth } from "../lib/store";

export function ScreenApp() {
  const health = useHealth();
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Lights On: screen</h1>
      <p>Placeholder big screen. Your city needs you.</p>
      <p>Server: {health.status}{health.dataMode ? ` (data_mode: ${health.dataMode})` : ""}</p>
    </main>
  );
}
