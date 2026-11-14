import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CommandError } from "../lib/ws";
import { safeGet, safeSet, useGame, useRoomSocket } from "../lib/store";
import { ConnBanner, ErrorToast, PhaseBadge, button, input, page } from "../lib/ui";
import { requestSensors } from "./pointer";
import { Pitch, PowerUp, Result } from "./Round";
import { Explore } from "./Explore";

const playerKey = (room: string) => `lo.player.${room}`;

export function PlayApp() {
  const [params] = useSearchParams();
  const [sensors, setSensors] = useState(false);
  const room = (params.get("room") ?? safeGet("lo.room") ?? "").toUpperCase() || null;
  const [playerId, setPlayerId] = useState<string | null>(() => (room ? safeGet(playerKey(room)) : null));
  const idRef = useRef(playerId);
  idRef.current = playerId;
  const sock = useRoomSocket(room, "play", () => idRef.current);
  const { players, hasState, phase, conn, roundId, counteroffers } = useGame();

  useEffect(() => {
    if (room) safeSet("lo.room", room);
  }, [room]);

  // If the room was reset (or restarted) and no longer knows us, go back to Join.
  useEffect(() => {
    if (hasState && playerId && !players[playerId]) setPlayerId(null);
  }, [hasState, players, playerId]);

  const me = playerId ? players[playerId] : undefined;

  if (!room) {
    return (
      <main style={page}>
        <h1>Lights On</h1>
        <p>Scan the QR code on the big screen to join.</p>
      </main>
    );
  }

  return (
    <main style={page}>
      <ConnBanner />
      <ErrorToast />
      {!me ? (
        <Join
          disabled={conn !== "open"}
          onJoin={async (nickname) => {
            const permissions = requestSensors();
            void permissions.then(setSensors);
            const r = await sock.current?.send({ type: "join", nickname });
            const id = String(r?.player_id ?? "");
            if (id) {
              safeSet(playerKey(room), id);
              setPlayerId(id);
            }
          }}
        />
      ) : (
        <>
          <h2 style={{ color: me.color }}>{me.nickname}</h2>
          <PhaseBadge />
          {phase === "EXPLORE" ? (
            <Explore sock={sock} color={me.color} sensors={sensors} />
          ) : (
            phase === "PITCH" || phase === "NEGOTIATE" ? <Pitch key={`${roundId}-${phase}`} sock={sock} playerId={me.id} revision={phase === "NEGOTIATE"} /> :
            phase === "POWER_UP" ? <PowerUp sock={sock} color={me.color} /> :
            phase === "VERDICT" || phase === "REVIVED" ? <Result playerId={me.id} /> :
            phase === "CHALLENGE" ? <section><h1>The city fights back</h1><p>{counteroffers[me.id]?.counteroffer ?? "The building is considering your pitch…"}</p><p>Get ready for one revision.</p></section> :
            <p>{phase === "LOBBY" ? "Waiting for another player…" : "Meet the building on the big screen."}</p>
          )}
        </>
      )}
    </main>
  );
}

function Join({ onJoin, disabled }: { onJoin: (nickname: string) => Promise<void>; disabled: boolean }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await onJoin(name);
    } catch (e) {
      setErr(e instanceof CommandError ? e.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  }, [name, onJoin]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      style={{ display: "grid", gap: 12 }}
    >
      <h1>Lights On</h1>
      <p>Your city needs you. Pick a nickname.</p>
      <input style={input} value={name} maxLength={16} placeholder="Nickname" autoFocus onChange={(e) => setName(e.target.value)} aria-label="Nickname" />
      <button style={button} type="submit" disabled={disabled || busy || !name.trim()}>
        Join
      </button>
      {err && <p role="alert">{err}</p>}
    </form>
  );
}
