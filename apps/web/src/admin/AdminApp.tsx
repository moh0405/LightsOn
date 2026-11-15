import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/api";
import { CommandError } from "../lib/ws";
import { safeGet, safeSet, useGame, useRoomSocket } from "../lib/store";
import { ConnBanner, ErrorToast, PhaseBadge, button, input, page } from "../lib/ui";

const ACTIONS: { action: string; label: string }[] = [
  { action: "skip_phase", label: "Skip phase" },
  { action: "reset_round", label: "Reset round" },
  { action: "reset_room", label: "Reset room" },
];

// The demo preset is a server setting (DEMO_MODE=1), so the host sees it here and restarts to change it.
export function demoPresetText(demoMode: boolean | null): string {
  if (demoMode === null) return "Demo preset: unknown (server health unavailable)";
  return demoMode
    ? "Demo preset ON: pitch 20 s, negotiate 15 s, wake list Esperson and Wells Fargo Plaza (once prepared)"
    : "Demo preset off: normal timers. Restart the server with DEMO_MODE=1 for the demo round.";
}

export function AdminApp() {
  const [room, setRoom] = useState<string>(safeGet("lo.room") ?? "");
  const [active, setActive] = useState<string | null>(room.length === 4 ? room.toUpperCase() : null);
  const [pin, setPin] = useState<string>(safeGet("lo.pin", "session") ?? "");
  const sock = useRoomSocket(active, "admin");
  const { dataMode, dataModeScope, players, conn } = useGame();
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetchHealth()
      .then((h) => { if (live) setDemoMode(h.demo_mode === true); })
      .catch(() => { if (live) setDemoMode(null); });
    return () => { live = false; };
  }, []);

  const run = async (extra: Record<string, unknown>) => {
    safeSet("lo.pin", pin, "session");
    try {
      await sock.current?.send({ type: "host_action", pin, ...extra });
    } catch (e) {
      // One toast surface for both server rejections and local transport failures.
      useGame.setState({ lastError: {
        code: e instanceof CommandError ? e.code : "host_action_failed",
        message: e instanceof CommandError ? e.message : "Failed.",
        at: Date.now(),
      } });
    }
  };

  return (
    <main style={page}>
      <ConnBanner /><ErrorToast />
      <h1>Lights On: admin</h1>
      <p data-testid="demo-preset" style={{ fontWeight: 600, color: demoMode ? "#7bd88f" : undefined }}>{demoPresetText(demoMode)}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input style={input} aria-label="Room code" placeholder="Room code" value={room} maxLength={4} onChange={(e) => setRoom(e.target.value.toUpperCase())} />
        <button style={button} disabled={room.length !== 4} onClick={() => setActive(room)}>Connect</button>
        <input style={input} aria-label="Host PIN" type="password" placeholder="Host PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
      </div>
      {active && (
        <>
          <PhaseBadge />
          <p>Room {active} · {conn} · {Object.keys(players).length} players · data mode: {dataMode} ({dataModeScope === "process" ? "all rooms" : ""})</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ACTIONS.map((a) => (
              <button key={a.action} style={button} disabled={!pin} onClick={() => void run({ action: a.action })}>{a.label}</button>
            ))}
            {(["kit", "fixtures"] as const).map((m) => (
              <button key={m} style={{ ...button, outline: dataMode === m ? "2px solid #7bd88f" : "none" }} disabled={!pin} onClick={() => void run({ action: "set_data_mode", data_mode: m })}>
                Data: {m}
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
