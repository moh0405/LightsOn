# Persona replies: regression and single paid check

Candidate repair and the one-word gym reply worked, but the paid round used one art-studio challenge fallback. No second paid run was made.

## Cause and implementation

The historical diagnostic at 2026-11-15T04:01:30Z omitted score IDs, so its exact mismatch cannot be recovered. Previously any missing, extra, duplicate or nickname-based candidate ID rejected the entire verdict before grounding. The server now constructs candidates from original pitches and their revisions, maps unambiguous aliases, ignores extras, and fills missing/ambiguous scores deterministically. Revisions without originals are excluded; actions.py still validates every state change.

Prepared-voice instructions and deterministic slang/emoji stripping precede grounding. Short pitches explicitly request a playful fact-citing nudge and a concrete next step.

## Offline evidence

All 24 initial regressions failed before implementation. The expanded tests cover kit and fixtures, single-player gym pitches, real IDs, nicknames, missing/extra players, duplicate/ambiguous aliases, revisions, slang and the Room flow through revival. Fake Bedrock replays the recorded gym verdict and paid challenge dialogue with simulated supported claim checks; this proves publication, not remote claim-check reliability.

Python: 654 passed, 1 skipped, from server/ with BEDROCK_SPEND_CAP_USD=3.00 and the real root .env symlink. Frontend: 68 passed. Quick eval: 356 passed. Web production build passed. Full Playwright e2e: 44 passed in 6.3 minutes on ports 21101/18174, including screen console-error assertions. Vite reported connection-reset messages during socket teardown; no browser checks failed.

## Single paid check

AGENT_MODE=live, DATA_MODE=kit, DEMO_MODE=1. Ann pitched `gym`; Bo pitched `A public art studio with evening classes for neighbors`. The round reached REVIVED. The script exited nonzero because its no-fallback assertion detected one claim_check fallback.

Shared ledger before: $3.0360682; after: $3.0692596; spent: $0.0331914. The adapter enforced a reservation ceiling of min(start + $0.10, $3.20).

Published lines verbatim, in publication order:

- intro: I made my entrance in 1941. Pitch like you mean it, kid — I have been waiting long enough.
- challenge: Dollface, 150,365 square feet across my dark floors await your pitch. What footprint would your shared space need?
  Counteroffer: Give your community space a reason to buzz after sunset. What do you say?
- challenge: My typical floor gives you 22,189 square feet—a gym needs purpose, footprint, and a pitch.
  Counteroffer: Show me your member count and equipment layout; I'll light up the right floor for you.
- verdict: The art studio with evening classes answers my quiet longing for light and life after dark — a gym is a fine idea, but it needs a real pitch before I can say I am in.

The Dollface art-studio challenge above is a deterministic fallback. The gym challenge and verdict are model dialogue. The intro is the existing prepared persona, not a paid generation.

The art-studio retry was rejected with `Asserts 8 floors are dark; current status doesn't prove duration` for:

> 8 dark floors, darling—but a studio needs light. Where's your daytime draw? Show me how evening classes fill those dark hours, and we'll talk about what the neighbors actually need.

This remaining remote claim-check false rejection is not repaired or claimed fixed by the candidate/voice change. Private evidence remains in server/state/persona_replies_paid.json and live_agent.jsonl, excluded from git.
