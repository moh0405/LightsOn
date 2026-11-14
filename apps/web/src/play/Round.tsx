import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { safeGet, safeSet, useGame } from "../lib/store";
import { button, input } from "../lib/ui";
import type { RoomSocket } from "../lib/ws";
import { createFlickDetector } from "./gesture";

type SocketRef = MutableRefObject<RoomSocket | null>;
export function Pitch({ sock, revision = false, playerId }: { sock: SocketRef; revision?: boolean; playerId: string }) {
  const { room, roundId, conn, counteroffers } = useGame();
  const key = `lo.sent.${room}.${roundId}.${playerId}.${revision ? "revision" : "pitch"}`;
  const [text, setText] = useState("");
  const [sent, setSent] = useState(() => safeGet(key, "session") === "yes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offer = counteroffers[playerId];
  return <section style={{ display: "grid", gap: 16 }}>
    <h1>{revision ? "Make your deal" : "Pitch a new use"}</h1>
    {revision && (offer ? <blockquote><p>{offer.line}</p><strong>{offer.counteroffer}</strong></blockquote> : <p>Watch the building’s challenge on the big screen. You have one revision.</p>)}
    <form style={{ display: "grid", gap: 12 }} onSubmit={(e) => {
      e.preventDefault();
      if (busy || sent || !text.trim() || !sock.current) return;
      setBusy(true); setError(null);
      void sock.current.send({ type: revision ? "revise_pitch" : "submit_pitch", round_id: roundId, text: text.trim() }).then(() => {
        setSent(true); safeSet(key, "yes", "session");
      }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not send. Try again.")).finally(() => setBusy(false));
    }}>
      <label htmlFor="pitch-text">{revision ? "Your revision" : "Your pitch"}</label>
      <textarea id="pitch-text" style={{ ...input, minHeight: 150, resize: "vertical" }} maxLength={280} value={text} disabled={sent || busy}
        onChange={(e) => setText(e.target.value)} />
      <span>{text.length}/280</span>
      <button style={button} disabled={conn !== "open" || busy || sent || !text.trim()}>{sent ? "Sent" : busy ? "Sending…" : revision ? "Send revision" : "Submit pitch"}</button>
      {sent && <p role="status">{revision ? "Revision sent. Watch for the verdict!" : "Pitch sent. Get ready to negotiate!"}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  </section>;
}

export function PowerUp({ sock, color }: { sock: SocketRef; color: string }) {
  const { charge, roundId, conn } = useGame();
  const [pulse, setPulse] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(-Infinity);
  const contribute = useCallback(() => {
    const now = performance.now();
    if (now - last.current < 600 || charge >= 100 || conn !== "open" || !sock.current) return;
    last.current = now;
    setPulse((v) => v + 1); // immediate local feedback, independent of server/AI latency
    setError(null);
    void sock.current.send({ type: "contribute_energy", round_id: roundId }).then(() => {
      try { navigator.vibrate?.(45); } catch { /* Haptics are optional. */ }
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not charge. Tap to try again."));
  }, [charge, conn, roundId, sock]);
  useEffect(() => {
    const flick = createFlickDetector();
    const sample = (event: DeviceMotionEvent) => { if (flick(event.accelerationIncludingGravity?.y ?? null, performance.now())) contribute(); };
    window.addEventListener("devicemotion", sample);
    return () => window.removeEventListener("devicemotion", sample);
  }, [contribute]);
  return <section style={{ textAlign: "center", display: "grid", gap: 16 }}>
    <h1>Flick your phone up!</h1><p>Or tap to power up together.</p>
    <button key={pulse} style={{ ...button, minHeight: 190, borderRadius: 40, borderColor: color, boxShadow: `0 0 ${pulse ? 45 : 24}px ${color}`, fontSize: 32, transform: pulse % 2 ? "scale(0.97)" : "scale(1)" }} onClick={contribute} disabled={conn !== "open" || charge >= 100}>Tap to charge</button>
    <label>Shared energy <strong>{charge}%</strong><progress aria-label="Shared energy" max={100} value={charge} style={{ width: "100%", accentColor: color }} /></label>
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function Result({ playerId }: { playerId: string }) {
  const { verdict, players } = useGame();
  if (!verdict) return <p>Waiting for the building’s decision…</p>;
  const score = verdict.scores.find((s) => s.player_id === playerId);
  return <section><h1>{verdict.winner_player_id === playerId ? "You won the deal!" : `${players[verdict.winner_player_id]?.nickname ?? "A player"} won the deal!`}</h1>
    <p>{verdict.reason_line}</p>{score && <p>Your score: <strong>{score.total ?? "—"}/40</strong> · Needs bonus: +{score.needs_bonus ?? 0}</p>}
    <p>{verdict.desire_reveal}</p>
  </section>;
}
