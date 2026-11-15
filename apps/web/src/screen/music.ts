import type * as ToneModule from "tone";
import { firstFloorAt } from "./effects";
import { useEffect, useRef, useState } from "react";
import type { Category } from "../lib/types";
import type { Mood } from "../lib/protocol";
import { useGame, type GameState } from "../lib/store";
import { getDossier } from "../lib/buildings";

export const categoryLayers = {
  housing: "bass", food_retail: "drums", entertainment: "synth lead", community: "pads",
  culture: "strings", health: "arpeggio", work: "keys", wildcard: "bells",
} as const satisfies Record<Category, string>;
const categories = Object.keys(categoryLayers) as Category[];
export type MusicState = Record<Category, number | null>;
export const emptyMusic = (): MusicState => Object.fromEntries(categories.map((c) => [c, null])) as MusicState;
/** A repeat category lifts its layer 3 dB instead of duplicating it, up to +6 dB. */
export const MAX_LIFT_DB = 6;
export function reviveLayer(state: MusicState, category: Category): MusicState {
  return { ...state, [category]: state[category] === null ? 0 : Math.min(MAX_LIFT_DB, state[category]! + 3) };
}
export function layerDb(state: MusicState, category: Category, speaking: boolean): number {
  return state[category] === null ? -Infinity : -24 + state[category]! - (speaking ? 8 : 0);
}
export const TWO_BARS = 8 * 60 / 96;
const hash = (text: string) => Array.from(text).reduce((n, char) => (n * 31 + char.charCodeAt(0)) >>> 0, 0);

/** Tone touches AudioContext at import time, so it is only loaded after this passes. */
export function audioSupported(): boolean {
  const g = globalThis as typeof globalThis & { webkitAudioContext?: unknown };
  return typeof g.AudioContext === "function" || typeof g.webkitAudioContext === "function";
}

/** All notes are generated locally; a single clock keeps eight-bar patterns aligned. */
export class CityMusic {
  state = emptyMusic();
  private tone: typeof ToneModule | null = null;
  private speaking = false;
  private volumes = new Map<Category, ToneModule.Volume>();
  private synths: ToneModule.PolySynth[] = [];
  private loop: ToneModule.Loop | null = null;
  private motif: ToneModule.PolySynth | null = null;
  private started = false;
  async start() {
    if (this.started) return;
    if (!audioSupported()) throw new Error("Audio unavailable");
    // Loaded lazily inside the Start click so a browser without Web Audio
    // still renders the screen, QR and subtitles.
    const Tone = this.tone ??= await import("tone");
    await Tone.start();
    Tone.getTransport().bpm.value = 96;
    categories.forEach((category, i) => {
      const volume = new Tone.Volume(-80).toDestination();
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: (["triangle", "sine", "sawtooth", "sine", "triangle", "sine", "triangle", "sine"] as const)[i] },
        envelope: { attack: i === 3 || i === 4 ? 0.2 : 0.01, decay: 0.15, sustain: 0.25, release: 0.5 },
      }).connect(volume);
      this.volumes.set(category, volume); this.synths.push(synth);
    });
    this.motif = new Tone.PolySynth(Tone.Synth).toDestination();
    this.motif.volume.value = -22;
    let step = 0;
    this.loop = new Tone.Loop((time) => {
      // 64 eighth notes = eight 4/4 bars, all in D natural minor.
      const root = ["D", "Bb", "F", "C"][Math.floor(step / 16)];
      const scale = ["D4", "F4", "A4", "C5", "Bb4", "A4", "F4", "E4"];
      categories.forEach((category, i) => {
        if (this.state[category] === null) return;
        const synth = this.synths[i]!;
        if (i === 0 && step % 4 === 0) synth.triggerAttackRelease(`${root}2`, "8n", time);
        if (i === 1 && step % 2 === 0) synth.triggerAttackRelease(step % 8 === 4 ? "D3" : "D1", "32n", time);
        if (i === 2 && step % 4 === 2) synth.triggerAttackRelease(scale[(step / 2 | 0) % 8]!, "8n", time);
        if ((i === 3 || i === 4) && step % 16 === 0) synth.triggerAttackRelease(i === 3 ? ["D3", "F3", "A3"] : ["D4", "A4"], "1m", time);
        if (i === 5) synth.triggerAttackRelease(scale[step % 8]!, "16n", time);
        if (i === 6 && step % 8 === 0) synth.triggerAttackRelease([`${root}3`, "A3"], "4n", time);
        if (i === 7 && step % 8 === 6) synth.triggerAttackRelease(scale[(step / 8 | 0) % 8]!, "8n", time);
      });
      step = (step + 1) % 64;
    }, "8n").start(0);
    this.started = true;
    Tone.getTransport().start();
    this.sync(TWO_BARS);
  }
  revive(category: Category) { this.state = reviveLayer(this.state, category); this.sync(TWO_BARS); }
  restore(active: Category[]) {
    this.state = emptyMusic();
    for (const category of active) if (category in categoryLayers) this.state[category] = 0;
    this.sync(TWO_BARS);
  }
  duck(speaking: boolean) { this.speaking = speaking; this.sync(0.15); }
  signature(style: string, atMs = Date.now()) {
    const motifs = [["D4", "F4", "A4"], ["A4", "F4", "D4"], ["D5", "C5", "A4"], ["F4", "E4", "D4"]];
    // Tone.now() includes a look-ahead buffer; use the audio clock itself
    // so that buffer does not push the motif past the first visible floor.
    if (!this.tone) return;
    const now = this.tone.immediate() + Math.max(0, atMs - Date.now()) / 1000;
    motifs[hash(style) % motifs.length]!.forEach((note, i) => this.motif?.triggerAttackRelease(note, "16n", now + i * 0.12));
  }
  private sync(seconds: number) {
    for (const [category, volume] of this.volumes) volume.volume.rampTo(Math.max(-80, layerDb(this.state, category, this.speaking)), seconds);
  }
  dispose() {
    this.loop?.dispose(); this.loop = null;
    this.synths.forEach((synth) => synth.dispose()); this.synths = [];
    this.volumes.forEach((volume) => volume.dispose()); this.volumes.clear();
    this.motif?.dispose(); this.motif = null; this.started = false;
  }
}

interface PersonaVoice { voice_style: string; voice_id: string }
const defaultVoice: PersonaVoice = { voice_style: "", voice_id: "" };
/** Keep a line below Chrome's long-utterance limit without losing words. */
export function speechChunks(text: string): string[] {
  const plain = text.replace(/<[^>]*>/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[?(?:fact[_:-][\w:.-]+|F_\d+_[\w.-]+)\]?/gi, " ").replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  for (const sentence of plain.split(/(?<=[.!?])\s+/)) {
    let chunk = "";
    for (const word of sentence.trim().split(/\s+/)) {
      if (chunk && (chunk.length + word.length > 140 || chunk.split(" ").length >= 22)) { chunks.push(chunk); chunk = ""; }
      chunk += `${chunk ? " " : ""}${word}`;
    }
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

/** Browser voices at rate 1 average roughly 2.5 words per second; stay under it. */
export const SPOKEN_WORDS_PER_SECOND = 2.4;
const words = (text: string) => speechChunks(text).join(" ").split(" ").filter(Boolean);
/** Fit a spoken challenge into `maxWords`. The cards keep the full written
 * challenge and evidence; the voice keeps the ask (the counteroffer), whole
 * sentences first. Under four words nothing useful fits, so it says nothing. */
export function budgetLine(line: string, counteroffer: string, maxWords: number): string {
  const full = `${line} ${counteroffer}`.trim();
  if (words(full).length <= maxWords) return full;
  if (maxWords < 4) return "";
  const ask = counteroffer.trim() || line.trim();
  let kept = "";
  for (const sentence of ask.split(/(?<=[.!?])\s+/)) {
    const next = `${kept} ${sentence}`.trim();
    if (words(next).length > maxWords) break;
    kept = next;
  }
  return kept || `${words(ask).slice(0, maxWords).join(" ").replace(/[,;:.!?]+$/, "")}…`;
}

function browserVoice(persona: PersonaVoice): SpeechSynthesisVoice | null {
  const synth = window.speechSynthesis;
  // Start audio primes discovery. If OS voices are still loading, speak with
  // the browser default now; a later line can select the prepared voice.
  // OS lists include musical/novelty voices; hashing across all English voices
  // can select Bells, Whisper, or Zarvox. Use the natural default unless named.
  const voices = synth.getVoices().filter(v => /^en(?:-|$)/i.test(v.lang));
  const natural = voices.filter(v => !/^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Junior|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)$/i.test(v.name));
  return natural.find(v => persona.voice_style.toLowerCase().includes(v.name.toLowerCase()))
    ?? natural.find(v => v.default) ?? natural.find(v => /^(Samantha|Daniel|Karen|Google US English|Microsoft .* Natural)/.test(v.name))
    ?? natural.sort((a, b) => a.name.localeCompare(b.name))[0] ?? null;
}

export async function browserSpeech(text: string, persona: PersonaVoice, _mood: Mood, signal: AbortSignal): Promise<void> {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") throw new Error("speech unavailable");
  const voice = browserVoice(persona);
  for (const chunk of speechChunks(text)) {
    if (signal.aborted) return;
    await new Promise<void>((resolve, reject) => {
      const speech = new SpeechSynthesisUtterance(chunk);
      speech.voice = voice; speech.lang = voice?.lang ?? "en-US";
      // Mood belongs in the words; keep the building's voice intelligible.
      speech.rate = 1; speech.pitch = 1;
      let settled = false;
      const finish = (error?: string) => {
        if (settled) return;
        settled = true; clearTimeout(timeout); signal.removeEventListener("abort", abort);
        speech.onend = null; speech.onerror = null;
        if (error && !signal.aborted) reject(new Error(`speech unavailable: ${error}`)); else resolve();
      };
      const abort = () => { finish(); window.speechSynthesis.cancel(); };
      const timeout = setTimeout(() => { finish("timeout"); window.speechSynthesis.cancel(); }, 20_000);
      signal.addEventListener("abort", abort, { once: true });
      speech.onend = () => finish(); speech.onerror = (event) => finish(event.error);
      try { window.speechSynthesis.speak(speech); } catch { finish("speak failed"); }
    });
  }
}
function playAudio(url: string, signal: AbortSignal, startupMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    let settled = false;
    const finish = (failed = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout); clearTimeout(startup); signal.removeEventListener("abort", abort);
      audio.onplaying = null; audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute("src");
      if (failed && !signal.aborted) reject(new Error("audio unavailable")); else resolve();
    };
    const abort = () => finish();
    const startup = setTimeout(() => finish(true), startupMs);
    const timeout = setTimeout(() => finish(true), 20_000);
    audio.onplaying = () => clearTimeout(startup);
    signal.addEventListener("abort", abort, { once: true });
    audio.onended = () => finish(); audio.onerror = () => finish(true);
    void audio.play().catch(() => finish(true));
  });
}

/** Screen-only hook: subtitles remain owned by the existing visual overlays. */
export function useScreenAudio() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const starting = useRef(false);
  const music = useRef<CityMusic | null>(null);
  useEffect(() => {
    if (!ready) return;
    const cityMusic = music.current;
    if (!cityMusic) return;
    let persona = defaultVoice;
    const spoken = new Set<string>();
    const challenged = new Set<string>();
    const latest = new Map<string, string>();
    let generation = 0;
    let queue = Promise.resolve();
    let controller = new AbortController();
    let personaRequest = new AbortController();
    const warn = (message: string) => { console.warn(message); setError(message); };
    const cancel = () => {
      generation++; controller.abort(); controller = new AbortController(); queue = Promise.resolve(); cityMusic.duck(false);
    };
    const loadPersona = (id: string | null) => {
      personaRequest.abort(); personaRequest = new AbortController(); persona = defaultVoice;
      if (!id) return;
      const requestSignal = personaRequest.signal;
      // The dossier says whether a persona was prepared, so an unprepared
      // building never triggers a 404 persona request.
      void getDossier(id)
        .then((dossier) => {
          const prepared = (dossier as typeof dossier & { persona?: Partial<PersonaVoice> | null }).persona;
          if (!requestSignal.aborted && prepared) persona = { voice_style: prepared.voice_style ?? "", voice_id: prepared.voice_id ?? "" };
        })
        .catch(() => { /* Optional persona: default browser voice still speaks the subtitle. */ });
    };
    const speechGroup = (phase: string) => ["INTRO", "PITCH"].includes(phase) ? "intro"
      // A challenge belongs to its own beat: NEGOTIATE is the players' turn.
      : ["VERDICT", "POWER_UP", "REVIVED"].includes(phase) ? "verdict" : phase;
    const say = (key: string, text: string, url: string | null, mood: Mood, prepare?: () => string) => {
      const identity = `${key}:${text}`;
      if (spoken.has(identity)) return;
      spoken.add(identity);
      latest.set(key, identity);
      const group = speechGroup(useGame.getState().phase);
      const { room, roundId } = useGame.getState();
      const current = generation, signal = controller.signal;
      queue = queue.then(async () => {
        // Finish the active line, but never start queued lines from an old phase.
        if (signal.aborted || current !== generation || latest.get(key) !== identity || group !== speechGroup(useGame.getState().phase)) return;
        // Budget against the time left when this line actually starts.
        const words = prepare ? prepare() : text;
        if (!words) return;
        if (prepare) url = null; // a prepared clip cannot be shortened; speak the budgeted words
        cityMusic.duck(true);
        try {
          // Dynamic provider rendering must never delay a browser voice. Prepared
          // audio still plays; TTS remains the fallback where native speech is absent.
          const native = !!window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined";
          if (!url && !native) {
            try {
              const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ room, round_id: roundId, text: words, voice_id: persona.voice_id }), signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
              if (!r.ok) throw new Error();
              url = (await r.json() as { audio_url: string | null }).audio_url;
            } catch { if (!signal.aborted) warn("Voice service unavailable. Browser speech and subtitles remain available."); }
          }
          if (signal.aborted || latest.get(key) !== identity || group !== speechGroup(useGame.getState().phase)) return;
          if (url) {
            try { await playAudio(url, signal, native ? 150 : 5000); return; }
            catch { warn("Recorded speech unavailable. Using browser speech."); }
          }
          if (!signal.aborted && group === speechGroup(useGame.getState().phase)) await browserSpeech(words, persona, mood, signal);
        } catch (error) { if (!signal.aborted) { console.warn(error); warn("Audio unavailable. Follow the subtitles."); } }
        finally { if (current === generation) cityMusic.duck(false); }
      });
    };
    const sync = (state: GameState, previous?: GameState) => {
      if (!previous || state.buildingId !== previous.buildingId || state.dataMode !== previous.dataMode) loadPersona(state.buildingId);
      if (!previous || state.room !== previous.room || (state.hasState && !previous.hasState) || (state.city?.buildings_revived === 0 && previous.city?.buildings_revived !== 0)) cityMusic.restore(state.city?.song_categories ?? []);
      if (previous && (state.roundId !== previous.roundId || state.room !== previous.room || state.dataMode !== previous.dataMode)) { cancel(); spoken.clear(); latest.clear(); challenged.clear(); }
      // A07: challenge speech never runs into NEGOTIATE (or a host skip).
      if (previous && previous.phase === "CHALLENGE" && state.phase !== "CHALLENGE") cancel();
      if (["INTRO", "PITCH"].includes(state.phase) && state.intro) say("intro", state.intro.text, state.intro.audio_url, state.intro.mood);
      if (state.phase === "CHALLENGE") {
        for (const [player, offer] of Object.entries(state.counteroffers)) {
          // Live-agent catchphrase/thinking updates remain visible as subtitles.
          // Only a completed challenge owns the voice queue.
          if (!offer.counteroffer.trim() && !offer.fact_ids.length) continue;
          say(`challenge:${player}`, `${offer.line} ${offer.counteroffer}`, offer.audio_url, state.mood, () => {
            challenged.add(player);
            const { endsAt, pitches, counteroffers } = useGame.getState();
            if (!endsAt) return `${offer.line} ${offer.counteroffer}`.trim();
            // Share what is left of CHALLENGE among this player and everyone
            // still waiting to be challenged, in arrival order.
            const waiting = new Set([...Object.keys(pitches), ...Object.keys(counteroffers)]);
            const pending = Math.max(1, [...waiting].filter(id => id === player || !challenged.has(id)).length);
            const seconds = (new Date(endsAt).getTime() - Date.now() - 500) / 1000 / pending;
            return budgetLine(offer.line, offer.counteroffer, Math.floor(seconds * SPOKEN_WORDS_PER_SECOND));
          });
        }
      }
      if (speechGroup(state.phase) === "verdict" && state.verdict) say("verdict", state.verdict.reason_line, null, state.mood);
      if (previous && state.revival && state.revival !== previous.revival) {
        cityMusic.revive(state.revival.category);
        // Share the visual flash lead-in and first-floor timestamp.
        cityMusic.signature(`${state.buildingId}:${persona.voice_style}`, firstFloorAt(state.revival.at));
      }
    };
    sync(useGame.getState());
    const unsubscribe = useGame.subscribe(sync);
    return () => { unsubscribe(); cancel(); personaRequest.abort(); };
  }, [ready]);
  useEffect(() => () => { music.current?.dispose(); music.current = null; }, []);
  const start = async () => {
    if (starting.current || ready) return;
    starting.current = true; setError(null);
    // Trigger OS voice discovery inside the gesture, alongside AudioContext unlock.
    try { window.speechSynthesis?.getVoices(); } catch { /* Discovery is optional. */ }
    const instance = new CityMusic(); music.current = instance;
    try { await instance.start(); setReady(true); }
    catch { instance.dispose(); music.current = null; console.warn("Audio unavailable"); setError("Audio unavailable. Subtitles and typed play still work."); }
    finally { starting.current = false; }
  };
  return { ready, error, start };
}
