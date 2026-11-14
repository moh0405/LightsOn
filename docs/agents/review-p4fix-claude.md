# Review of the Phase 4 fixes: PR #14, f877bbe..a5709db (Claude, read-only)

**Verdict: pass-with-issues.** All 7 fixes and QA4-01 are in place. No real Bedrock calls were made, no files were edited, and nothing was committed.

## How I checked
- I symlinked the kit (`data`) and `.env` into the worktree.
- `cd server && uv run pytest`: **227 passed, 1 skipped** (the opt-in Vexcel live test).
- `pnpm -r test`: **36/36 passed**.
- `evals/run.py --quick` just runs `pytest tests/test_prep_agent.py`, which is covered above.
- **Mutation check.** I copied the repo to the scratchpad, reverted each fix there, and ran the suite. 10 of 14 reverts made a test fail. The 4 reverts that no test caught are in finding 3.
- Spend ledger (main checkout `server/state/bedrock_spend.json`): **total_usd = 1.6842**, 28 calls. The last call is the persona-only regeneration (Sonnet, $0.0658).

## Findings, most severe first

### 1. MEDIUM (product): grounding is right, but the code cuts out most of the character's voice
Files: `server/app/agent/persona.py` (`normalize_writer_persona`, `FICTION_WORDS`, `fiction_text`)

**What happened**
- `normalize_writer_persona` splits each beat into sentences. It drops any sentence that is not a known fact clause and does not pass the `FICTION_WORDS` word allowlist, without logging it.
- I compared the model's proposal (`phase4-fixes/server/cache/prep/233953/work/persona_proposal.json`) with the shipped fixture. These lines were removed:
  - "That kind of staying power is not an accident, darling."
  - "I am not afraid of a little reinvention."
  - "Every floor is a chapter, and I am not done writing."
  - "That is a canvas, not a closet."
  - "Every exit is just the story asking for a better second act."
  - "I have taste, and I have standards."
- Neighbor 233918's line ("Bold ambition looks splendid on you, darling, truly.") was swapped for the canned "Save some applause for me."
- The result: the shipped backstory is 9 template clauses plus 4 lines from the canned list.
- The era voice ("old-Houston art-deco pride") appears only in `voice_style`, which no UI or TTS uses. Place and era words are not in the allowlist, so no spoken line can sound like old Houston.

**Is it entertaining?** Partly. The investor lines are good ("I invest in nerve, not polite applause.", "My pride is expensive; your imagination had better be priceless."). The intro "I made my entrance in 1941. Darling, bring me a plot twist and we might have a deal." is a real improvement. But most of the backstory still reads like stat call-outs: "670 former tenancy entries", "I've known the professional scientific and technical services crowd".

**Suggested fix**
- For fiction remainders, replace the word allowlist with a denylist check:
  - no digits;
  - no physical or history nouns (floor, lobby, roof, pool, built, renovated…);
  - no capitalised proper nouns other than the building's own name;
  - at most 2 sentences.
- Log every dropped sentence in `agent_steps`.
- Add 3–5 era-flavoured fiction lines per `ERA_VOICES` bucket.
- Add an eval check that the model's flourishes survive normalization.

### 2. MEDIUM (contract design, check b): `rejects_categories` carries no information
Files: `persona.py` `physical_limits` (every limit is given all 8 categories), `validate_persona` (`limit not in candidates` requires an exact dict match), `server/app/agent/fake_agent.py:78`

**What is wrong**
- Every limit lists all 8 categories, and the validator requires an exact match. So neither the model nor the code can ever narrow the list.
- The category gate in `challenge` (`if category not in limit['rejects_categories']`) therefore never skips anything.
- Only `floor_plate` and `dark_area` ever push back on a pitch: a single-floor pitch that asks for more area than the cited value.
- The `height` and `parking` limits never trigger anything.
  - The height text is filler: "a pitch requiring a taller existing building needs a different plan".

**Recommendation**
- Do not map limits to categories by guesswork. Saying "parking rejects entertainment" would be an invented fact.
- Replace `rejects_categories` with a numeric trigger, for example `trigger: area_exceeds | stories_exceeds | height_exceeds | parking_spaces_requested`, applied only when the pitch states a number.
- If the field is kept, set it to `[]` to mean "applies to every category, numeric mismatch only".
- Either give height and parking a numeric trigger or drop them from the limits list.

### 3. LOW: test gaps (reverts that no test caught)
- **(a) Vexcel date in the dossier.** Reverting `scripts/build_dossier.py` to use `capture_dates.ortho` is not caught.
  - `test_merge_only_positive_counts_and_natural_wording` gives the ortho and the detection the same date.
  - Add a case where ortho is 2023-08-02 and the detection has no date. The text must then say "unknown capture date".
- **(b) Desire in `merge_research`.** The check `desire_reason_fact_ids ⊆ researched` (`prep_agent.py:147`) is untested.
- **(c) Cache check.** The `source_fingerprint` and snapshot check in `cached_result` is not covered either.
  - `test_cache_rejects_modified_source_facts` still passes without the check, because `cached_result` overlays `source_snapshot` on its return value anyway.
  - Forge the fingerprint or a persona citation instead.
- **(d) DENY regex.** Removing it is not caught. That is acceptable: the fact clauses and the allowlist already block "dossier".

### 4. LOW: the PRD contract is out of date
- `docs/PRD.md:687` still says `hard_limits: list[str]`.
- The approved contract (`docs/overnight-log.md:98`) is not reflected in the PRD Contracts section.

### 5. LOW: a failed forced prep deletes the previous trusted cache
- `prep_agent.py` runs `result_path.unlink()` before the run. A failed forced prep leaves no `dossier.json`, so a plain POST returns 404 until the next prep.
- The published persona fixture survives, so play is unaffected.
- This matches the spec ("never leaves a trusted cache"). It is noted only for awareness.

### 6. INFO
- The construction-year `say_as` reads "1,941 year" (this predates the PR). It shows in the Evidence overlay.
- The Vexcel clause reads awkwardly: "In imagery with an unknown capture date, it looks like 31 cars detected within about 30 m of the parcel."

## Checked and fine (with evidence)

### Fix 1: cache poisoning
- The model backend is now rooted at `<cache>/<id>/work` (`prep_agent.py`, `workspace = directory / 'work'`).
- The trusted `dossier.json` and the persona are written only after `merge_research` and `validate_persona` pass.
- A cache hit needs `prep_status == 'ready'`, a matching fingerprint and snapshot, and a revalidated persona. It then overlays the source facts.
- I checked deepagents' `FilesystemBackend(virtual_mode=True)` directly: `/../dossier.json`, `../dossier.json` and `/work/../../dossier.json` all raise "Path traversal not allowed".
- Test: `test_failed_model_cannot_poison_trusted_cache` fails when the fix is reverted.

### Fix 2: hard limits
- Limits are typed `HardLimit` objects built only from verified positive values of grossTypicalFloorSquareFeet, the available area of a dark floor, buildingHeightInFeet and parkingRatio.
- Identity facts are rejected.
- At least 2 limits are required, or the list is explicitly empty with `EMPTY_LIMITS`.
- Each limit must cite a distinct fact, and that fact must have been researched.
- Tests: `test_physical_limits_reject_identity_require_two_and_challenge_oversize` and `test_explicit_floor_pitch_uses_that_floor_area_not_typical_plate`. Reverting either the "candidates" check or the "≥ 2" check makes them fail.
- Caveat: finding 2.

### Fix 3: spend
- **`MeteredClient` is the only path to the SDK.**
  - It reserves against the final `modelId` and `inferenceConfig.maxTokens`.
  - It refuses `additionalModelRequestFields`, a service tier other than default, non-standard latency, media blocks and unknown cache TTLs.
  - Cache reads are priced at 0.1×, 5-minute writes at 1.25× and 1-hour writes at 2×.
  - `get_num_tokens_from_messages` is local only, and `_stream` raises.
- A per-call `model_copy` avoids shared mutation between concurrent calls.
- **No bypass.** In langchain-aws, `_generate` uses only `self.client.converse`. A grep finds no boto3, ChatBedrock or `.converse(` call outside `spend.py`.
- `regenerate_persona` checks its cost estimate against a 2.90 limit and also caps the model at 2.90.
- Reverting the metering makes 7 tests fail. Reverting the cache pricing makes 3 tests fail.

### Fix 4: auth (`main.py`)
- A plain POST only reads the trusted cache. It returns 404 if there is none and never calls prep or Bedrock.
- `force=true` requires the `X-Host-Pin` header, compared with `secrets.compare_digest`. If HOST_PIN is unset, the request is refused.
- `emit` no longer blocks on `.result()`.
- Tests: `test_prep_force_requires_constant_time_host_pin_and_plain_post_never_spends` and `test_plain_prep_returns_trusted_cache_without_model`. Both fail when their fix is reverted.

### Fix 5: voice
- "My dossier…" is gone everywhere, including `fake_agent.py`.
- Beats start with a fact clause, numbers must match the cited fact, any remainder must be fiction, and a beat has at most 2 sentences.
- There is an era-voice table.
- Derived facts were added: `dark_floor_count`, `dark_sqft`, `former_tenancy_records` and `top_former_industry_1..3`.
- Tests: `test_era_voice_and_structured_beats_check_numbers_and_claims` and `test_voice_style_cannot_smuggle_physical_claims`.
- Caveat: finding 1 on entertainment.

### Fix 6: desire
- `desire_reason_fact_ids` must be non-empty, have no duplicates, and fall within `desire_support[key]`. `desire_reason` must equal the fixed fictional reason for that key.
- `merge_research` requires the cited facts to have been researched.
- Test: `test_desire_requires_relevant_researched_support` fails when the fix is reverted (gap: finding 3b).

### Fix 7 and QA4-01: Vexcel provenance and evidence labels
- `fetch_vexcel.detection_capture` uses only the detection's own date or an image with the same `imageId`. Otherwise the date is null.
- The regenerated fixtures carry `capture_date: null`, and the dossiers now say "in imagery with an unknown capture date".
- **CoStar facts are unchanged.** In all 7 dossier diffs, the only removed lines are the 3 Vexcel `say_as` lines.
- Esperson floors 6–8 are dark at 31,503 sq ft each.
- `factDescription` adds an "Estimate ·" prefix in the HoverCard and the Evidence overlay.
- Test: `test_fetch_detection_dates_are_bound_to_its_image_not_property` fails when the fix is reverted.

### Check (a): the Persona contract is consistent
- `models.py` HardLimit and Persona match `types.ts` field for field, and the Literal values match.
- The fixture validates in both modes (`test_committed_hero_persona_is_valid_and_served`).
- The fake agent consumes `hard_limits` (`fake_agent.py:72-87`).
- The prompt (`PERSONA_WRITER_PROMPT`) and `writer_instructions` describe all four new fields.
- No UI renders `hard_limits` or `desire_reason`, so nothing is broken. Only `docs/PRD.md` is stale (finding 4).

### Check (b): every factual clause in the fixture checked against the dossier
| Clause | Dossier value |
|---|---|
| 1941 | ConstructionComplete |
| 2014 | RenovationFinished |
| 27 stories | numStoriesAboveGrade |
| 22,189 sq ft | grossTypicalFloorSquareFeet |
| 8 dark floors | 6, 7, 8, 17, 18, 20, 21, 24 |
| 150,365 sq ft | 3 × 31,503 + 17,696 + 15,364 + 9,068 + 9,057 + 4,671 |
| 670 former tenancies | 738 − 68 |
| industries 1 and 3 | ProfessionalScientificAndTechnicalServices (148) and FinancialInstitutions (24), decoded through IndustryType |
| 297 ft | buildingHeightInFeet |
| parking 0.89 | parkingRatio; "per 1,000 sq ft" is supported by `docs/costar/models/commercial-property.md:86` |
| floor 7: 31,503 sq ft | floor_7_available_sqft |

- Every factual claim is cited.
- The fiction lines contain no physical claims.
- The desire is night_life, cited to the dark-floor facts, which is sensible.
- There is no "vacant" and no contact names.

### Check (c): spend
- The ledger reads 1.6842.
- There is no unmetered path.
- A forced prep requires `X-Host-Pin`.
- I made no Bedrock calls during this review.

### Non-negotiables
- No contacts in the new facts (tenant data is aggregate and industry-only).
- The kit was not loaded whole; the new query runs against `index.sqlite`.
- Enums are decoded.
- No secrets appear in logs or URLs.
- No `any` was added in game state.
