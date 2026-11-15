import { useEffect, useState, type CSSProperties } from "react";
import { useGame } from "../../lib/store";
import { button } from "../../lib/ui";
import { replayThrough, type AgentStep, type RecordedTrace } from "../trace-model";

const card: CSSProperties = { background: "#151c29", border: "1px solid #35435a", borderRadius: 12, padding: 16, minWidth: 0, overflowWrap: "anywhere" };
const muted: CSSProperties = { color: "#aabbd2", fontSize: 22 };

function StepList({ events, live = false }: { events: AgentStep[]; live?: boolean }) {
  return <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
    {events.map((event, i) => <li key={i} data-testid={live ? "live-trace-step" : "recorded-trace-step"}
      style={{ padding: "9px 0", borderBottom: "1px solid #2b374b", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12 }}>
      <div><strong style={{ color: event.step === "fallback" ? "#ffcb7b" : "#a5ead7" }}>{event.step}</strong>
        <div style={{ fontFamily: "monospace", fontSize: 22, marginTop: 3 }}>{event.tool}</div>
        {live && event.step === "fallback" && <small style={{ fontSize: 22 }}>{event.summary}</small>}</div>
      <span style={muted}>{event.duration_ms.toLocaleString()} ms</span>
    </li>)}
  </ol>;
}

export function TracePanel() {
  const [open, setOpen] = useState(false);
  const [recorded, setRecorded] = useState<RecordedTrace | null>(null);
  const [error, setError] = useState(false);
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const live = useGame((s) => s.agentSteps);
  const roundId = useGame((s) => s.roundId);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let active = true;
    setError(false);
    void fetch("/api/buildings/233953/trace", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Trace unavailable");
        const trace = await response.json() as RecordedTrace;
        if (active) { setRecorded(trace); setCount(trace.events.length); }
      }).catch(() => { if (active) setError(true); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [open]);

  useEffect(() => {
    if (!open || !playing || !recorded) return;
    if (count >= recorded.events.length) { setPlaying(false); return; }
    const timer = setTimeout(() => setCount((value) => value + 1), 250);
    return () => clearTimeout(timer);
  }, [open, playing, recorded, count]);

  return <>
    <button aria-expanded={open} aria-controls="trace-panel" onClick={() => setOpen((value) => !value)}
      style={{ ...button, fontSize: 28, padding: "4px 12px", position: "fixed", bottom: 16, right: 16, zIndex: 30 }}>Agent trace · T</button>
    {open && <section id="trace-panel" role="region" aria-label="Agent trace" data-testid="trace-panel"
      style={{ fontFamily: "system-ui, sans-serif", fontSize: 22, lineHeight: 1.25, position: "fixed", inset: 32, zIndex: 40, background: "#0c1220f8", color: "#f2f6ff", border: "1px solid #637a9d", borderRadius: 18, padding: 24, boxSizing: "border-box", boxShadow: "0 16px 80px #000b", display: "flex", flexDirection: "column", gap: 18 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div><h2 style={{ margin: 0, fontSize: 32 }}>Inside the building’s agent</h2><p style={{ ...muted, margin: "6px 0 0" }}>Public tool activity · no private reasoning or prompts</p></div>
        <button style={{ ...button, fontSize: 22 }} onClick={() => setOpen(false)}>Close · T / Esc</button>
      </header>
      {error && <p role="alert">Recorded trace unavailable. Live events and the game remain available.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(250px, 0.85fr) minmax(350px, 1.35fr) minmax(250px, 1fr)", gap: 18, minHeight: 0, flex: 1 }}>
        <aside style={{ ...card, overflow: "auto" }}>
          <h3 style={{ fontSize: 28, marginTop: 0 }}>Esperson · prep evidence</h3>
          <h4 style={{ fontSize: 28, margin: "20px 0 10px" }}>Plan · write_todos</h4>
          <p style={muted}>{recorded?.plan_recorded ? "Planning tool call recorded; todo contents were not captured." : "No write_todos call captured in this recording."}</p>
          <h4 style={{ fontSize: 28, margin: "20px 0 10px" }}>Named subagents</h4>
          {["property_scout", "spatial_scout", "persona_writer"].map((name) => {
            const event = recorded?.events.find((e) => e.step === name && e.tool === "task");
            return <p key={name} style={{ fontFamily: "monospace", fontSize: 22 }}>{name}<br /><span style={muted}>{event ? `task · ${event.duration_ms.toLocaleString()} ms` : "Not recorded"}</span></p>;
          })}
          <h4 style={{ fontSize: 28, margin: "20px 0 10px" }}>Files in prep cache</h4>
          <ul style={{ fontFamily: "monospace", fontSize: 22, paddingLeft: 20 }}>{recorded?.files.map((file) => <li key={file}>{file}</li>)}</ul>
          <h4 style={{ fontSize: 28, margin: "20px 0 10px" }}>Bedrock model IDs</h4>
          <p style={muted}>Current configuration; historical model IDs were not captured.</p>
          {recorded?.configured_model_ids.map((model) => <p key={model} style={{ fontFamily: "monospace", fontSize: 22, overflowWrap: "anywhere", color: "#a5ead7" }}>{model}</p>)}
          <details style={muted}><summary>Recording limits</summary>{recorded?.notes.map((note) => <p key={note}>{note}</p>)}</details>
        </aside>
        <section style={{ ...card, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <h3 style={{ fontSize: 28, marginTop: 0 }}>Recorded prep run (deepagents on Amazon Bedrock)</h3>
          <p style={{ ...muted, marginTop: 0 }}>Esperson · {count}/{recorded?.events.length ?? 0} recorded calls · durations as recorded</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button style={{ ...button, fontSize: 22 }} disabled={!recorded?.available} onClick={() => { setCount(0); setPlaying(true); }}>Replay</button>
            <button style={{ ...button, fontSize: 22 }} disabled={!playing} onClick={() => setPlaying(false)}>Pause</button>
            <button style={{ ...button, fontSize: 22 }} disabled={!recorded?.available} onClick={() => { setPlaying(false); setCount(recorded?.events.length ?? 0); }}>Show all</button>
          </div>
          <small style={muted}>Accelerated replay · one recorded call every 250 ms</small>
          <div style={{ overflow: "auto", minHeight: 0, flex: 1 }}>
            {!recorded && !error && <p role="status">Loading recorded prep…</p>}
            {recorded && !recorded.available && <p>No recorded prep available. Prepare it with host tools before the demo.</p>}
            <StepList events={replayThrough(recorded?.events ?? [], count)} />
          </div>
          <p style={{ ...muted, marginBottom: 0 }}>Deterministic merge / validation: {recorded?.events.some((event) => event.tool === "validate_persona") ? "completion marker recorded" : "not recorded"}.</p>
        </section>
        <section style={{ ...card, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <h3 style={{ fontSize: 28, marginTop: 0, color: "#a5ead7" }}>Live</h3>
          <p style={{ ...muted, marginTop: 0 }}>Current round · {roundId ?? "waiting for a round"}</p>
          <p style={muted}>Challenge / verdict calls, grounding checks and fallbacks received from the server.</p>
          <div style={{ overflow: "auto", minHeight: 0, flex: 1 }} data-testid="live-trace">
            {live.length === 0 && <p>No agent steps received for this round. Offline play may use deterministic responses.</p>}
            <StepList events={live} live />
          </div>
          <small style={muted}>This screen keeps the latest 120 events received. Events before connection are not replayed.</small>
        </section>
      </div>
    </section>}
  </>;
}
