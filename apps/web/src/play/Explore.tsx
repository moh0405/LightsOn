import { useRef, type MutableRefObject } from "react";
import { useGame } from "../lib/store";
import { button } from "../lib/ui";
import type { RoomSocket } from "../lib/ws";

const SEND_EVERY_MS = 33; // ~30 Hz, never waits on the server

/** Touch-trackpad: dragging here moves your colored dot on the big screen. */
export function Explore({ sock, color }: { sock: MutableRefObject<RoomSocket | null>; color: string }) {
  const heroIds = useGame((s) => s.heroIds);
  const last = useRef(0);

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const now = performance.now();
    if (now - last.current < SEND_EVERY_MS) return;
    last.current = now;
    const r = e.currentTarget.getBoundingClientRect();
    sock.current?.emit({
      type: "pointer",
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    });
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div
        data-testid="trackpad"
        onPointerDown={move}
        onPointerMove={move}
        style={{ touchAction: "none", height: 260, borderRadius: 12, border: `2px solid ${color}`, background: "#141824", display: "grid", placeItems: "center" }}
      >
        Drag to aim at the skyline
      </div>
      <p>Wake a building:</p>
      {heroIds.map((id) => (
        <button key={id} style={button} onClick={() => void sock.current?.send({ type: "wake", building_id: id }).catch(() => undefined)}>
          Wake building {id}
        </button>
      ))}
    </section>
  );
}
