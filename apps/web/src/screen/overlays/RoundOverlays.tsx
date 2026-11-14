import { useEffect, useState, type CSSProperties } from "react";
import { factDescription, getDossier, type Dossier } from "../../lib/buildings";
import { useGame } from "../../lib/store";
import type { Need } from "../../lib/protocol";
const card: CSSProperties = { background: "#171e2de8", border: "1px solid #39455a", borderRadius: 16, padding: 20 };
const labels: Record<Need, string> = { housing: "Housing", food_retail: "Food and retail", entertainment: "Entertainment", community: "Community" };

export function Subtitles() {
  const { intro, phase } = useGame();
  if (!intro || !["INTRO", "PITCH"].includes(phase)) return null;
  return <section style={card} data-testid="subtitles" aria-live="polite"><p>{intro.text}</p><p>{intro.analyst_line}</p><small>Mood: {intro.mood}</small></section>;
}
export function Bubbles() {
  const { pitches, players, phase } = useGame();
  if (!["PITCH", "CHALLENGE", "NEGOTIATE"].includes(phase)) return null;
  return <section aria-label="Player pitches" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>{Object.values(pitches).map((p) => <blockquote style={{ ...card, borderColor: players[p.player_id]?.color, margin: 0, flex: "1 1 280px" }} key={p.player_id}><strong>{players[p.player_id]?.nickname ?? "Player"}</strong><p>{p.text}</p></blockquote>)}</section>;
}
export function ChallengeCards() {
  const { counteroffers, players, phase } = useGame();
  if (!["CHALLENGE", "NEGOTIATE"].includes(phase)) return null;
  return <section aria-label="Building counteroffers" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>{Object.values(counteroffers).map((c) => <article style={{ ...card, flex: "1 1 280px" }} key={c.player_id}><h3>To {players[c.player_id]?.nickname ?? "Player"}</h3><p>{c.line}</p><strong>{c.counteroffer}</strong><Evidence ids={c.fact_ids} /></article>)}</section>;
}
export function Evidence({ ids }: { ids: string[] }) {
  const { buildingId, dataMode } = useGame();
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; setDossier(null); setFailed(false);
    if (buildingId) void getDossier(buildingId).then((d) => { if (active) setDossier(d); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [buildingId, dataMode]);
  return <div aria-label="Cited evidence">{ids.map((id) => <p key={id}><small>{id}: {(dossier?.facts?.find((f) => f.id === id) ? factDescription(dossier.facts.find((f) => f.id === id)!) : null) ?? (failed ? "Evidence unavailable" : dossier ? "Source text unavailable" : "Loading evidence…")}</small></p>)}</div>;
}
export function ScoreCard() {
  const { verdict, players, phase } = useGame();
  if (!verdict || phase !== "VERDICT") return null;
  const impact = verdict.impact;
  return <section data-testid="score-card" style={card}>
    <h2 style={{ color: players[verdict.winner_player_id]?.color }}>{players[verdict.winner_player_id]?.nickname ?? "Player"} wins · {verdict.category.replaceAll("_", " ")}</h2>
    <p>{verdict.reason_line}</p><p>{verdict.desire_reveal}</p>
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", textAlign: "left", borderSpacing: "12px" }}><thead><tr>{["Player", "Data fit", "Neighborhood fit", "Creativity", "Charm", "Needs bonus", "Total"].map((label) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{verdict.scores.map((s) => <tr key={s.player_id}><th>{players[s.player_id]?.nickname ?? "Player"}</th><td>{s.data_fit}/10</td><td>{s.neighborhood_fit}/10</td><td>{s.creativity}/10</td><td>{s.charm}/10</td><td>+{s.needs_bonus ?? 0} (included)</td><td>{s.total ?? "—"}/40</td></tr>)}</tbody></table></div>
    <Evidence ids={verdict.fact_ids} />
    {verdict.category === "housing" && impact?.kind === "housing_estimate" && <p>{typeof impact.units === "number" ? impact.units : "—"} homes · {typeof impact.residents === "number" ? impact.residents : "—"} residents — rough game estimate, not a feasibility claim</p>}
  </section>;
}
export function EnergyMeter() {
  const { phase, charge, revival } = useGame();
  if (!["POWER_UP", "REVIVED"].includes(phase)) return null;
  return <section style={card} data-testid="energy-meter"><label>Power up together · <strong>{charge}%</strong><progress aria-label="City energy" value={charge} max={100} style={{ width: "100%", height: 32, accentColor: revival?.color ?? "#f2c46d" }} /></label>{revival?.auto_completed && <p>The city helped finish this charge.</p>}</section>;
}
export function CityMeter() {
  const city = useGame((s) => s.city);
  if (!city) return null;
  return <section data-testid="city-meter" style={{ ...card, padding: 12, fontSize: 28 }}><h2 style={{ fontSize: 32, margin: 0 }}>City progress</h2><p style={{ margin: "2px 0", fontSize: 28 }}>game simulation</p><p style={{ margin: "2px 0" }}><strong>{city.buildings_revived}</strong> buildings revived</p><p style={{ margin: "2px 0" }}><strong>{city.sqft_reimagined.toLocaleString()}</strong> sq ft reimagined</p><p style={{ margin: "2px 0" }}>{city.song_layers} city song layers</p><NeedsBars /></section>;
}
export function NeedsBars() {
  const city = useGame((s) => s.city);
  if (!city) return null;
  return <section aria-label="City needs"><h3 style={{ fontSize: 28, margin: "8px 0 4px" }}>City needs</h3>{(Object.keys(labels) as Need[]).map((key) => <label key={key} style={{ display: "block", marginTop: 2, fontSize: 28 }}>{labels[key]}: {Math.round(city.needs[key])}<meter aria-label={labels[key]} min={0} max={100} value={Math.round(city.needs[key])} style={{ display: "block", width: "100%", height: 16 }} /></label>)}<p style={{ margin: "8px 0 0" }}>Most needed: {labels[city.most_needed]}</p></section>;
}
export function RoundOverlays() {
  return <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, maxHeight: "90%", overflowY: "auto", display: "grid", gap: 12, fontSize: 28 }}><Subtitles /><Bubbles /><ChallengeCards /><ScoreCard /><EnergyMeter /></div>;
}
