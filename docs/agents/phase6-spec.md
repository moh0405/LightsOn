# Phase 6: voice, media, music, polish (two parallel tasks)

Read AGENTS.md, docs/agent-workflow.md, docs/PRD.md "Visuals and audio" (all), "Physical interaction" (Instant feedback),
"Phase 6", and the current apps/web/src + server/app/voice/. Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data and
.env into the worktree (never commit/print). Small commits (phase6: ...), tests first, push after each. NO Bedrock calls
(fake agent in tests/e2e). Every external call behind an adapter with timeout, fallback and logged error; UI shows a
toast, never a crash. Subtitles always show. Typed input always works.

## Facts / decisions (coordinator)
- ELEVENLABS_API_KEY is NOT set. Use ElevenLabs only when the key exists. Free fallbacks instead of Polly/Transcribe
  (AWS budget is reserved for Bedrock): TTS fallback = the browser's speechSynthesis on /screen (a voice chosen per
  persona.voice_style, rate/pitch per mood); STT fallback = the browser's SpeechRecognition / webkitSpeechRecognition on the
  phone when available, else typed input. Do not call Polly or Transcribe.
- No loop audio files exist and no music generation service: synthesize the 8 layers procedurally with Tone.js synths
  (deterministic patterns, 96 BPM, D minor, 8 bars) instead of loop files.
- No concept-art service: ConceptCard uses simple hand-made SVG illustrations per category in public/concepts/, labelled
  "Game concept, not a real renovation".
- Matterport: public showcase embed `https://my.matterport.com/show/?m=<model_id>` from the dossier media list (kit model
  ids); if the iframe fails or is blocked, show the kit caption as a still card. Vexcel images are local files in
  apps/web/public/media/<id>/ (gitignored); if missing, skip that beat.

## Task 6A: audio and voice (branch phase6/audio, ports LO_E2E_API_PORT=19501 LO_E2E_WEB_PORT=16574)
1. server/app/voice/tts.py: ElevenLabs streaming when keyed, cached by text hash in server/cache/tts/; otherwise returns
   audio_url null and the client speaks the subtitle via speechSynthesis. POST /api/tts per PRD.
2. server/app/voice/stt.py + POST /api/rooms/{room}/pitch_audio (multipart audio, player_id, phase) -> STT -> submit_pitch /
   revise_pitch: ElevenLabs STT when keyed; else 503 with a clear code (the phone then uses browser speech recognition and
   submits the text).
3. play/recorder.ts hold-to-talk with MediaRecorder; browser SpeechRecognition path; mic permission denied -> typed input.
4. screen/music.ts with Tone.js: "Start" click unlocks audio; 8 procedural category layers per PRD mapping; fade in on
   building_revived (2 bars); +3 dB lift for a category already playing; duck -8 dB while the building speaks; per-persona
   signature sound on the first lit floor.
5. Tests: Vitest for music state logic (layers, lift, ducking) and recorder fallbacks; pytest for tts/stt adapters with
   fakes; Playwright (fake mic/speech) that a round still completes with audio unavailable and no console errors.

## Task 6B: media and payoff (branch phase6/media, ports LO_E2E_API_PORT=19601 LO_E2E_WEB_PORT=16674)
1. INTRO sequence on /screen: camera dive -> Vexcel aerial (ortho then obliques, 1-2 s each, captioned with the estimate
   label and capture date when known) -> Matterport embed or caption still -> intro subtitles. Never blocks the round timer.
2. Light-up sequence exactly per PRD: 200 ms white flash at base, floors bottom to top 60 ms stagger with 600 ms fade,
   spark particles into the building (2D canvas overlay), city meter + needs bars animate; softer version when
   building_revived.auto_completed.
3. ConceptCard (P1, small): before/after card after revival with the category SVG and the required label.
4. Projector polish: Space Grotesk + Inter fonts (local files in public/fonts or system fallback), 28 px body minimum at
   1080p, no overflow with 0-4 players, consistent colors, toast component for every error event.
5. Tests: Vitest for sequence timing helpers; Playwright screenshots of INTRO and REVIVED at 1920x1080, a timing assertion
   that floors start lighting within 300 ms, and no console errors.

## Done means (each task)
pytest (kit mounted), pnpm -r test, full e2e 3x green on your ports, build. `gh pr create --base main --label agent:codex`
with screenshots; end the body with "🤖 Generated with Codex, coordinated by Claude Code". worker_done with PR URL.
Only edit files your task owns (6A: server/app/voice/*, server/app/main.py route additions, apps/web/src/play/*,
apps/web/src/screen/music.ts and its wiring; 6B: apps/web/src/screen/* except music.ts, apps/web/public/concepts, fonts).
