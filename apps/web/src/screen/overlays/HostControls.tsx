import { useEffect, useState, type MutableRefObject } from "react";
import { ACTIONS } from "../../admin/AdminApp";
import { safeGet, safeSet, useGame } from "../../lib/store";
import { CommandError, type RoomSocket } from "../../lib/ws";

/** Projector host overlay (toggle H). The server checks the PIN on every action. */
export function HostControls({ sock }: { sock: MutableRefObject<RoomSocket | null> }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState(() => safeGet("lo.pin", "session") ?? "");
  const { dataMode, room } = useGame();
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  if (!open) return null;
  const run = async (extra: Record<string, unknown>) => {
    safeSet("lo.pin", pin, "session");
    try {
      await sock.current?.send({ type: "host_action", pin, ...extra });
    } catch (e) {
      useGame.setState({ lastError: {
        code: e instanceof CommandError ? e.code : "host_action_failed",
        message: e instanceof CommandError ? e.message : "Host action failed.",
        at: Date.now(),
      } });
    }
  };
  return <section className="host-controls" role="region" aria-label="Host controls">
    <header><strong>Host controls · H</strong><button onClick={() => setOpen(false)}>Close · H / Esc</button></header>
    <p>Room {room ?? "…"} · data mode: {dataMode}</p>
    <input aria-label="Host PIN" type="password" placeholder="Host PIN" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} />
    <div className="host-actions">
      {ACTIONS.map((a) => <button key={a.action} disabled={!pin} onClick={() => void run({ action: a.action })}>{a.label}</button>)}
      {(["kit", "fixtures"] as const).map((m) => <button key={m} disabled={!pin} aria-pressed={dataMode === m}
        onClick={() => void run({ action: "set_data_mode", data_mode: m })}>Data: {m}</button>)}
    </div>
  </section>;
}
