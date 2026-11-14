import { useState } from "react";
import { CommandError } from "../lib/ws";
import { safeGet, safeSet, useGame, useRoomSocket } from "../lib/store";
import { ConnBanner, PhaseBadge, button, input, page } from "../lib/ui";

const ACTIONS: { action: string; label: string }[] = [
  { action: "skip_phase", label: "Skip phase" },
  { action: "reset_round", label: "Reset round" },
  { action: "reset_room", label: "Reset room" },
];

export function AdminApp() {
  const [room, setRoom] = useState<string>(safeGet("lo.room") ?? "");
  const [active, setActive] = useState<string | null>(room.length === 4 ? room.toUpperCase() : null);
  const [pin, setPin] = useState<string>(safeGet("lo.pin", "session") ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const sock = useRoomSocket(active, "admin");
  const { dataMode, dataModeScope, players, conn } = useGame();

  const run = async (extra: Record<string, unknown>) => {
    setMsg(null);
    safeSet("lo.pin", pin, "session");
    try {
      await sock.current?.send({ type: "host_action", pin, ...extra });
    } catch (e) {
      setMsg(e instanceof CommandError ? e.message : "Failed.");
    }
  };

  return (
    <main style={page}>
      <ConnBanner />
      <h1>Lights On: admin</h1>
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
      {msg && <p role="alert">{msg}</p>}
    </main>
  );
}
