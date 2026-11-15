import { useCallback, useEffect, useState } from "react";
import { CityMeter, RoundOverlays } from "./overlays/RoundOverlays";
import { City } from "./City";
import { createRoom } from "../lib/api";
import { safeGet, safeSet, useGame, useRoomSocket } from "../lib/store";
import { IntroMedia } from "./IntroMedia";
import "./screen.css";
import { WalkInside } from "./WalkInside";
import { ConnBanner, ErrorToast, PhaseBadge, page } from "../lib/ui";
import { useScreenAudio } from "./music";
import { TracePanel } from "./overlays/TracePanel";
import { getDossier } from "../lib/buildings";

/** The waking building's name from its dossier; the internal id never reaches the projector. */
function useBuildingName(id: string | null): string | null {
  const [name, setName] = useState<{ id: string; name: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    if (id) void getDossier(id).then((d) => { if (active) setName({ id, name: d.name }); }).catch(() => { if (active) setName({ id, name: null }); });
    return () => { active = false; };
  }, [id]);
  return name && name.id === id ? name.name : null;
}

export function ScreenApp() {
  const audio = useScreenAudio();
  const [room, setRoom] = useState<string | null>(null);
  const [qr, setQr] = useState<{ svg: string; url: string } | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const onMediaError = useCallback((message: string) => setMediaError(message), []);
  const [failed, setFailed] = useState(false);
  useRoomSocket(room, "screen");
  const { players, buildingId, hasState, dataMode, heroIds, tourRequest, phase } = useGame();
  const [hovered, setHovered] = useState<string | null>(null);
  const [walk, setWalk] = useState<{ buildingId: string; modelId: string | null } | null>(null);
  const target = buildingId ?? hovered ?? heroIds[0] ?? null;
  const closeTour = useCallback(() => setWalk(null), []);
  const toggleTour = useCallback(() => setWalk((current) => current ? null : target ? { buildingId: target, modelId: null } : null), [target]);
  useEffect(() => {
    if (tourRequest) setWalk(tourRequest.open && tourRequest.buildingId ? { buildingId: tourRequest.buildingId, modelId: tourRequest.modelId } : null);
  }, [tourRequest]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
      if (event.repeat) return;
      if (event.key === "Escape") closeTour();
      if (event.key.toLowerCase() === "m") { event.preventDefault(); toggleTour(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [closeTour, toggleTour]);
  // Keep the light-up moment visible even if a host left a tour open.
  useEffect(() => { if (phase === "POWER_UP" || phase === "REVIVED") closeTour(); }, [phase, closeTour]);
  const buildingName = useBuildingName(buildingId);

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
    <><TracePanel />
    <main className={`projector${walk ? " walking" : ""}`} style={{ ...page, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 390px", gap: 16, height: "100vh", boxSizing: "border-box", overflow: "hidden" }}>
      <section className="screen-stage">
        <ConnBanner /><ErrorToast />
        {failed && <p role="alert">Could not reach the server.</p>}
        <header className="screen-heading"><h1>Lights On</h1>{!audio.ready && <button onClick={() => void audio.start()}>Start audio</button>}<button disabled={!target} onClick={toggleTour}>Walk inside · M</button><span>Your city needs you.</span></header>
        {audio.error && <p role="alert">{audio.error}</p>}
        <div className="screen-status"><PhaseBadge />{dataMode === "fixtures" && <span className="data-badge" data-testid="data-mode-badge">Fixture data · offline</span>}{buildingId && <p className="building-label" data-testid="building-label">Waking {buildingName ?? "a building"}</p>}</div>
        <div className="city-stage"><City onHover={setHovered} /><IntroMedia onError={onMediaError} /><RoundOverlays /></div>
        {walk && <WalkInside key={walk.buildingId} buildingId={walk.buildingId} modelId={walk.modelId} close={closeTour} />}
        {mediaError && <div className="screen-toast" role="alert">{mediaError}<button aria-label="Dismiss media notice" onClick={() => setMediaError(null)}>×</button></div>}
      </section>
      <style>{`[data-testid="qr"] svg { display: block; width: 100%; height: auto; }`}</style>
      <aside style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 6 }}>
        {qr && (
          <>
            <div data-testid="qr" style={{ background: "#fff", padding: 8, borderRadius: 8, width: 200, boxSizing: "border-box" }} dangerouslySetInnerHTML={{ __html: qr.svg }} />
            <p style={{ wordBreak: "break-all", fontSize: 28, margin: 0 }}>{qr.url}</p>
            <p style={{ margin: 0 }}>Room code: <strong>{room}</strong></p>
          </>
        )}
        <h3 style={{ margin: 0 }}>Players ({Object.keys(players).length}/4)</h3>
        {!hasState && <p>…</p>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 28 }}>
          {Object.values(players).map((p) => (
            <li key={p.id} style={{ opacity: p.connected ? 1 : 0.4, display: "flex", gap: 6 }}>
              <span style={{ color: p.color, flexShrink: 0 }}>●</span><div>{p.nickname}</div>
            </li>
          ))}
        </ul>
        <CityMeter />
      </aside>
    </main></>
  );
}
