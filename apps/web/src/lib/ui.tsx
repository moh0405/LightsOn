import { useEffect, useState, type CSSProperties } from "react";
import { TOAST_MS, useGame, useCountdown } from "./store";

export const page: CSSProperties = { fontFamily: "system-ui, sans-serif", color: "#eee", background: "#0b0d12", minHeight: "100vh", padding: 16, boxSizing: "border-box" };
export const button: CSSProperties = { padding: "12px 16px", fontSize: 16, borderRadius: 8, border: "1px solid #445", background: "#1c2230", color: "#eee", cursor: "pointer" };
export const input: CSSProperties = { padding: 12, fontSize: 16, borderRadius: 8, border: "1px solid #445", background: "#141824", color: "#eee" };

export function ConnBanner() {
  const conn = useGame((s) => s.conn);
  if (conn === "open") return null;
  return (
    <div role="status" style={{ background: "#5a3b00", padding: "6px 10px", borderRadius: 6, marginBottom: 8 }}>
      {conn === "connecting" ? "Connecting…" : "Reconnecting…"}
    </div>
  );
}

export function ErrorToast() {
  const err = useGame((s) => s.lastError);
  const [hidden, setHidden] = useState<typeof err>(null);
  useEffect(() => {
    if (!err) return;
    const timer = setTimeout(() => setHidden(err), Math.max(0, TOAST_MS - (Date.now() - err.at)));
    return () => clearTimeout(timer);
  }, [err]);
  if (!err || hidden === err) return null;
  return (
    <div role="alert" style={{ background: "#5a1020", padding: "6px 10px", borderRadius: 6, marginBottom: 8 }}>
      {err.message}
    </div>
  );
}

export function PhaseBadge() {
  const phase = useGame((s) => s.phase);
  const endsAt = useGame((s) => s.endsAt);
  const left = useCountdown(endsAt);
  return (
    <p data-testid="phase">
      Phase: <strong>{phase}</strong>
      {left !== null ? ` · ${left}s` : ""}
    </p>
  );
}
