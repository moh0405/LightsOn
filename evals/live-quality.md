# Phase 5 live quality follow-up

## Offline diagnosis of the original paid run

Evidence: `evals/report.md`, retained worker terminal output (the 19:30–19:31 UTC
paid run), and main's durable ledger entries 29–53 (zero-based). Room snapshots
do not contain these eval steps: the runner used in-memory rooms. Rejected raw
responses and individual grounding reasons were not retained. The table separates
observed causes from unresolved ones rather than assigning a guessed cause.

| Step | Result / cause | Evidence / limits |
| --- | --- | --- |
| Esperson challenge batch 1 | Timeout | `ReadTimeoutError`; ledger 29 unconfirmed |
| Esperson challenge batch 2 | Unknown exception | Two complete Haiku generations (30–31), then `Live challenge unavailable`; no schema failures or claim-check call |
| Esperson challenge batch 3 | Timeout | `ReadTimeoutError`; ledger 32 unconfirmed |
| Esperson challenge batch 4 | Timeout | `ReadTimeoutError`; ledger 33 unconfirmed |
| Esperson strong_fit / impossible_area verdict 1 | Local grounding rejection; exact check unknown | Two complete Sonnet generations (34–35); no claim-check call |
| Esperson strong_fit / impossible_area verdict 2 | Local grounding rejection; exact check unknown | Two complete Sonnet generations (36–37); no claim-check call |
| Esperson strong_fit / impossible_area verdict 3 | Local grounding rejection; exact check unknown | Two complete Sonnet generations (38–39); no claim-check call |
| Esperson desire / borderline verdict 1 | Local grounding rejection; exact check unknown | Two complete Sonnet generations (40–41); no claim-check call |
| Esperson desire / borderline verdict 2 | Claim-check rejection (inferred from call order) | Sonnet generations 42–43, Haiku check 44, then `Live grounding unavailable` |
| Esperson desire / borderline verdict 3 | Local grounding rejection; exact check unknown | Two complete Sonnet generations (45–46); no claim-check call |
| Esperson equivalent_a / equivalent_b verdict 1 | Unknown exception | One complete Sonnet generation (47), then `Live verdict unavailable`; no schema failure or claim-check call |
| Esperson equivalent_a / equivalent_b verdict 2 | Unknown exception | One complete Sonnet generation (48), then `Live verdict unavailable`; no schema failure or claim-check call |
| Wells Fargo Plaza challenge batch 1 | Timeout | `ReadTimeoutError`; ledger 51 unconfirmed |
| Wells Fargo Plaza challenge batch 2 | Local grounding rejection; exact check unknown | Two complete Haiku generations (52–53); no claim-check call |

Totals: **14 fallback steps: 4 timeout, 6 local grounding (fact-ID / number /
estimate-label / length / safety check unresolved), 1 claim-check rejection
(inferred), 3 unknown exceptions**. Invalid JSON/schema attempts: 0. Budget
stopped scheduling remaining cases; it did not produce a fallback in the retained
steps. Seven safety/injection refusals were screened before inference and are
separate from these 14 live fallbacks. The one successful step was Esperson's
third equivalent-ideas verdict (ledger 49–50).

Offline reproductions use the actual cited floor area from the published eval:
`Floor 6, ... 31,503 sq ft` fails because the old numeric regex consumes the
trailing comma in the floor label; `31.5k` fails because the multiplier is ignored.
`about 31,500 square feet` already passes the existing 0.1% tolerance. Completion
years without separators already pass and remain exact. These demonstrate defects,
but cannot prove which original raw candidates triggered the unresolved failures.

New private diagnostics append rejected line, cited IDs, check, reason, attempt,
step and building ID to `server/state/live_agent.jsonl` (or `STATE_DIR`). They also
record fallback causes, schema failures, and retain timeout versus budget causes
through spend accounting. Pitches, SDK error bodies, unvalidated schema payloads,
and screened generated dialogue are not retained.

## Fixes and remaining limits

The source checks now parse punctuation and compact quantities, constrain floor
labels to floor context, preserve exact years and explicitly sourced percentages,
and leave ordinary number words as dialogue. Claim checks distinguish persona
fiction and hypothetical plans from physical assertions. Live prompts retain
persona/desire/limit references, an example dark floor, requested floors and
spatial evidence, with exact `say_as` and deterministic spoken clauses. Context
fell from roughly 21/39 KB to 7/6 KB for Esperson/Wells before the small check.
Missing source fields remain null and are listed as unknown, without citable IDs.

Challenges are generated as one round batch, then validated per player; a failed
player gets at most one grounding regeneration without replacing already validated
players. The deadline remains 8 seconds for the whole challenge step and 12 for a
verdict, including schema retries, regeneration and claim checks. Streamed tool
JSON is validated after usage reconciliation, so malformed JSON and `max_tokens`
are schema failures with a retry rather than disguised spend failures. Unexpected
room exceptions recover through the offline judge and arm a timer, or return to
EXPLORE with a toast if even the fallback verdict cannot validate. Mood retains
all seven PRD values with a typed protocol/store union.

Fallbacks use triggered physical limits first, then pitch-relevant evidence
(including an explicitly requested floor), a category-specific question, the
persona's voice and catchphrase, and a desire-based counteroffer. Round positions
vary source facts and voice deterministically. No unsupported number from a pitch
is accepted as a property fact.

The one small paid check is in `evals/live-quality-check.md`: **4/8 challenge
fallbacks (1 number-match, 3 timeout), 0/2 verdict fallbacks, $0.116304 spent,
ledger $2.556235**. This misses the ≤1/8 target. Six retained number rejections and
two missing-constraint-ID rejections forced regeneration; one regeneration ran
out of the shared deadline. Prompt instructions alone did not stop the model from
repeating unsupported pitch numbers. One accepted model challenge also invented
a floor-status duration that the cheap claim checker missed; its exact line is
now a failing-first offline regression and a deterministic rejection. A further
offline regression distinguishes a hypothetical one-floor pilot from an existing
floor count. The final constraint-first prompt and these post-check fixes have
**not** been paid-revalidated. No paid evidence supports calling the remaining
model reliability or latency gates passed.
