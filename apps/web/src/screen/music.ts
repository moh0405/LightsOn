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
export function reviveLayer(state: MusicState, category: Category): MusicState {
  return { ...state, [category]: state[category] === null ? 0 : state[category]! + 3 };
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
const moodVoice: Record<Mood, [number, number]> = {
  lonely: [0.85, 0.85], proud: [0.95, 0.9], bitter: [0.85, 0.8], anxious: [1.1, 1.1],
  hopeful: [1, 1.05], flattered: [1.05, 1.15], offended: [0.9, 0.85],
};
function browserSpeech(text: string, persona: PersonaVoice, mood: Mood, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") { reject(new Error("speech unavailable")); return; }
    const speech = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    if (voices.length) speech.voice = voices.find((v) => persona.voice_style.toLowerCase().includes(v.name.toLowerCase())) ?? voices[hash(persona.voice_style) % voices.length]!;
    [speech.rate, speech.pitch] = moodVoice[mood];
    const finish = (failed = false) => {
      clearTimeout(timeout); signal.removeEventListener("abort", abort);
      speech.onend = null; speech.onerror = null;
      if (failed && !signal.aborted) reject(new Error("speech unavailable")); else resolve();
    };
    const abort = () => { window.speechSynthesis.cancel(); finish(); };
    const timeout = setTimeout(() => { window.speechSynthesis.cancel(); finish(true); }, 20_000);
    signal.addEventListener("abort", abort, { once: true });
    speech.onend = () => finish(); speech.onerror = () => finish(true);
    try { window.speechSynthesis.speak(speech); } catch { finish(true); }
  });
}
function playAudio(url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    const finish = (failed = false) => {
      clearTimeout(timeout); signal.removeEventListener("abort", abort);
      audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute("src");
      if (failed && !signal.aborted) reject(new Error("audio unavailable")); else resolve();
    };
    const abort = () => finish();
    const timeout = setTimeout(() => finish(true), 20_000);
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
    const say = (text: string, url: string | null, mood: Mood) => {
      const current = generation, signal = controller.signal;
      queue = queue.then(async () => {
        if (signal.aborted || current !== generation) return;
        cityMusic.duck(true);
        try {
          if (!url) {
            try {
              const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice_id: persona.voice_id }), signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
              if (!r.ok) throw new Error();
              url = (await r.json() as { audio_url: string | null }).audio_url;
            } catch { if (!signal.aborted) warn("Voice service unavailable. Browser speech and subtitles remain available."); }
          }
          if (signal.aborted) return;
          if (url) {
            try { await playAudio(url, signal); return; }
            catch { warn("Recorded speech unavailable. Using browser speech."); }
          }
          if (!signal.aborted) await browserSpeech(text, persona, mood, signal);
        } catch { if (!signal.aborted) warn("Audio unavailable. Follow the subtitles."); }
        finally { if (current === generation) cityMusic.duck(false); }
      });
    };
    const sync = (state: GameState, previous?: GameState) => {
      if (!previous || state.buildingId !== previous.buildingId || state.dataMode !== previous.dataMode) loadPersona(state.buildingId);
      if (!previous || state.room !== previous.room || (state.hasState && !previous.hasState) || (state.city?.buildings_revived === 0 && previous.city?.buildings_revived !== 0)) cityMusic.restore(state.city?.song_categories ?? []);
      const speechGroup = (phase: string) => ["INTRO", "PITCH"].includes(phase) ? "intro" : ["CHALLENGE", "NEGOTIATE"].includes(phase) ? "challenge" : phase;
      if (previous && (state.roundId !== previous.roundId || speechGroup(state.phase) !== speechGroup(previous.phase))) cancel();
      if (["INTRO", "PITCH"].includes(state.phase) && state.intro && state.intro !== previous?.intro) say(state.intro.text, state.intro.audio_url, state.intro.mood);
      if (["CHALLENGE", "NEGOTIATE"].includes(state.phase)) {
        for (const [player, offer] of Object.entries(state.counteroffers)) {
          if (offer !== previous?.counteroffers[player]) say(`${offer.line} ${offer.counteroffer}`, offer.audio_url, state.mood);
        }
      }
      if (state.phase === "VERDICT" && state.verdict && state.verdict !== previous?.verdict) say(state.verdict.reason_line, null, state.mood);
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
    const instance = new CityMusic(); music.current = instance;
    try { await instance.start(); setReady(true); }
    catch { instance.dispose(); music.current = null; console.warn("Audio unavailable"); setError("Audio unavailable. Subtitles and typed play still work."); }
    finally { starting.current = false; }
  };
  return { ready, error, start };
}
