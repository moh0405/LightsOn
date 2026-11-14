import { useCallback, useEffect, useState } from "react";
import { CityMeter, RoundOverlays } from "./overlays/RoundOverlays";
import { City } from "./City";
import { createRoom } from "../lib/api";
import { safeGet, safeSet, useGame, useRoomSocket } from "../lib/store";
import { IntroMedia } from "./IntroMedia";
import "./screen.css";
import { ConnBanner, ErrorToast, PhaseBadge, page } from "../lib/ui";
import { useScreenAudio } from "./music";

export function ScreenApp() {
  const audio = useScreenAudio();
  const [room, setRoom] = useState<string | null>(null);
  const [qr, setQr] = useState<{ svg: string; url: string } | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const onMediaError = useCallback((message: string) => setMediaError(message), []);
  const [failed, setFailed] = useState(false);
  useRoomSocket(room, "screen");
  const { players, buildingId, hasState } = useGame();

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
    <main className="projector" style={{ ...page, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 390px", gap: 16, height: "100vh", boxSizing: "border-box", overflow: "hidden" }}>
      <section className="screen-stage">
        <ConnBanner /><ErrorToast />
        {failed && <p role="alert">Could not reach the server.</p>}
        <header className="screen-heading"><h1>Lights On</h1><span>Your city needs you.</span></header>
        {!audio.ready && <button onClick={() => void audio.start()}>Start audio</button>}
        {audio.error && <p role="alert">{audio.error}</p>}
        <PhaseBadge />
        {buildingId && <p className="building-label">Waking building {buildingId}</p>}
        <div className="city-stage"><City /><IntroMedia onError={onMediaError} /><RoundOverlays /></div>
        {mediaError && <div className="screen-toast" role="alert">{mediaError}<button aria-label="Dismiss media notice" onClick={() => setMediaError(null)}>×</button></div>}
      </section>
      <style>{`[data-testid="qr"] svg { display: block; width: 100%; height: auto; }`}</style>
      <aside style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 6 }}>
        {qr && (
          <>
            <div data-testid="qr" style={{ background: "#fff", padding: 8, borderRadius: 8, width: 160, boxSizing: "border-box" }} dangerouslySetInnerHTML={{ __html: qr.svg }} />
            <p style={{ wordBreak: "break-all", fontSize: 28, margin: 0 }}>{qr.url}</p>
            <p style={{ margin: 0 }}>Room code: <strong>{room}</strong></p>
          </>
        )}
        <h3 style={{ margin: 0 }}>Players ({Object.keys(players).length}/4)</h3>
        {!hasState && <p>…</p>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 28 }}>
          {Object.values(players).map((p) => (
            <li key={p.id} style={{ opacity: p.connected ? 1 : 0.4 }}>
              <span style={{ color: p.color }}>●</span> {p.nickname}
            </li>
          ))}
        </ul>
        <CityMeter />
      </aside>
    </main>
  );
}
