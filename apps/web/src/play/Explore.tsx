import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { getData, type Building } from "../lib/buildings";
import { useGame } from "../lib/store";
import { button } from "../lib/ui";
import type { RoomSocket } from "../lib/ws";
import { aim, clamp, rateLimit, smooth, type Point } from "./pointer";

export function Explore({ sock, color, sensors = false }: { sock: MutableRefObject<RoomSocket | null>; color: string; sensors?: boolean }) {
  const dataMode = useGame((s) => s.dataMode);
  const heroIds = useGame((s) => s.heroIds);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [error, setError] = useState(false);
  const [sample, setSample] = useState<{ alpha: number; beta: number } | null>(null);
  const [origin, setOrigin] = useState<{ alpha: number; beta: number } | null>(null);
  const allow = useRef(rateLimit());
  const smoothed = useRef<Point>({ x: 0.5, y: 0.5 });
  useEffect(() => {
    let active = true;
    setBuildings([]);
    setError(false);
    void getData<Building[]>("/api/buildings").then((b) => { if (active) setBuildings(b); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [dataMode]);
  useEffect(() => {
    if (!sensors) return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null) return;
      setSample({ alpha: e.alpha, beta: e.beta });
      if (!origin) return;
      smoothed.current = smooth(smoothed.current, aim(e.alpha, e.beta, origin.alpha, origin.beta));
      if (allow.current(performance.now())) sock.current?.emit({ type: "pointer", ...smoothed.current });
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [sensors, origin, sock]);

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!allow.current(performance.now())) return;
    const r = e.currentTarget.getBoundingClientRect();
    sock.current?.emit({ type: "pointer", x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) });
  };
  return <section style={{ display: "grid", gap: 12 }}>
    {error && <p role="alert">Building names are unavailable. You can still wake a building below.</p>}
    {sensors && sample && <button style={button} onClick={() => { setOrigin(sample); smoothed.current = { x: 0.5, y: 0.5 }; }}>
      {origin ? "Recalibrate aim" : "Point at the middle of the screen and tap"}
    </button>}
    <div data-testid="trackpad" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e); }} onPointerMove={move}
      style={{ touchAction: "none", height: 260, borderRadius: 12, border: `2px solid ${color}`, background: "#141824", display: "grid", placeItems: "center" }}>
      Drag to aim at the skyline
    </div>
    <p>Wake a building:</p>
    {heroIds.map((id) => <button key={id} style={button} onClick={() => void sock.current?.send({ type: "wake", building_id: id }).catch(() => undefined)}>
      Wake building {buildings.find((b) => String(b.id) === id)?.name ?? id}
    </button>)}
  </section>;
}
