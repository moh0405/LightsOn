import { useEffect, useState } from "react";
import { createRoom } from "../lib/api";
import { safeGet, safeSet, useGame, useRoomSocket } from "../lib/store";
import { ConnBanner, PhaseBadge, page } from "../lib/ui";

export function ScreenApp() {
  const [room, setRoom] = useState<string | null>(null);
  const [qr, setQr] = useState<{ svg: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useRoomSocket(room, "screen");
  const { players, pointers, buildingId, hasState } = useGame();

  useEffect(() => {
    let cancelled = false;
    createRoom(safeGet("lo.screenRoom"))
      .then((r) => {
        if (cancelled) return;
        safeSet("lo.screenRoom", r.room);
        safeSet("lo.room", r.room); // lets /admin in the same browser find the room
        setQr({ svg: r.qr_svg, url: r.join_url });
        setRoom(r.room);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ ...page, display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
      <section>
        <ConnBanner />
        {failed && <p role="alert">Could not reach the server.</p>}
        <h1>Lights On: screen</h1>
        <PhaseBadge />
        {buildingId && <p>Waking building {buildingId}</p>}
        {/* Placeholder skyline: a flat field where phone pointers show up as colored dots (real skyline is Phase 2). */}
        <div data-testid="field" style={{ position: "relative", height: "60vh", border: "1px solid #334", borderRadius: 12, background: "#10131c", overflow: "hidden" }}>
          {Object.entries(pointers).map(([id, p]) => (
            <div
              key={id}
              data-testid="dot"
              style={{ position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: "50%", background: p.color, boxShadow: `0 0 16px ${p.color}`, transition: "left 60ms linear, top 60ms linear" }}
            >
              <span style={{ position: "absolute", top: 26, left: 0, fontSize: 12, whiteSpace: "nowrap" }}>{players[id]?.nickname}</span>
            </div>
          ))}
        </div>
      </section>
      <aside>
        {qr && (
          <>
            <div data-testid="qr" style={{ background: "#fff", padding: 8, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: qr.svg }} />
            <p style={{ wordBreak: "break-all", fontSize: 12 }}>{qr.url}</p>
            <p>Room code: <strong>{room}</strong></p>
          </>
        )}
        <h3>Players ({Object.keys(players).length}/4)</h3>
        {!hasState && <p>…</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {Object.values(players).map((p) => (
            <li key={p.id} style={{ opacity: p.connected ? 1 : 0.4 }}>
              <span style={{ color: p.color }}>●</span> {p.nickname}
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
