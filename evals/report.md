# Phase 5 live agent evaluation

Run: 2026-11-14T19:31:55.059581+00:00; DATA_MODE=kit; PARTIAL (budget stop).
Esperson uses its prepared persona; Wells Fargo Plaza uses a deterministic persona derived from its own dossier.

| Metric | Result | Target |
| --- | --- | --- |
| Published grounding | 100.0% (33/33) | 100% |
| Published schema | 100.0% (33/33) | 100% |
| Winner stability (modal winner / 3, mean over completed matchups) | 100.0% | ≥90% |
| First thinking subtitle p50 / p90 | 0.000 s / 0.000 s | ≤3 s |
| First grounded subtitle p50 / p90 | 3.875 s / 5.770 s | ≤3 s |
| Full grounded challenge batch p50 / p90 | 4.068 s / 5.963 s | p90 ≤6 s |
| Offline/template fallback steps | 14 | reported separately |
| Invalid model schema attempts | 0 | 0 |
| Completed paid requests | 21/25 | usage reconciled |
| Retained unconfirmed reservations | 4 | not discarded |
| Run spend (includes retained reservations) | $0.694657 | ≤$0.80 |
| Shared ledger total | $2.439931 | <$2.60 |

## Method and limits

Executed 24/32 planned challenge cases and 9/18 planned verdict evaluations; 3/6 matchups have all three repeats, all for Esperson. Wells Fargo Plaza has eight challenge cases and no verdict repeats in this paid sample. The planned suite has 32 challenge cases (16 per hero), batched four at a time; three verdict matchups per hero repeated three times. Strong fit, impossible numeric requirements, borderline, desire match, funny, injection, unsafe, mixed language and equivalent ideas are included. Only challenges and verdicts use Bedrock; claim checks use Haiku and verdict proposals use Sonnet. Player text is screened locally before calls. All displayed text passes source ID/number/unit checks and a batched cheap model claim check, or uses trusted source templates. Grounding and schema rates above describe published output INCLUDING fallback; fallback counts prevent confusing those rates with raw model reliability.

Latency measures the actual Room phase transition and counteroffer emissions to an in-process screen connection, including generation, retries, claim checks, fallback and cumulative prefix display. The first grounded text is buffered until the complete batch passes grounding. WebSocket network delivery and browser render time are not included. The immediate thinking line is existing persona fiction and is reported separately from the first grounded-model response.

Preflight estimate before retries/regeneration: $0.778; actual requests are independently reserved conservatively in spend.py. The live runner lowers the shared cap to min(start + $0.80, $2.59) and stops scheduling steps with less than $0.12 headroom. It never overwrites or resets the shared ledger.

Target assessment: grounding PASS; schema PASS; winner stability PASS. The recorded subtitle and full-challenge latencies above include fallback dialogue; **model challenge latency was not measured**, so those values cannot establish a model latency PASS. All six challenge batches fell back, including the one sourced template in Wells Fargo Plaza's second batch. The follow-up runner separates model and fallback timings.

The paid run used a 3-second socket read timeout, which caused four retained timeout reservations. After the run, the adapter was corrected offline to use the remaining 8-second challenge / 12-second verdict step budget, and prompts/grounding feedback were tightened to avoid repeating unsupported pitch numbers. These changes have offline regression coverage but were not re-evaluated on Bedrock: this report is the one paid run, not a measurement of those later changes. Fourteen of fifteen evaluated live steps required a fallback; only one verdict delivered model dialogue without fallback. Further live reliability validation is still needed, especially for Wells Fargo Plaza.

## Winner repeats

| Building | Matchup | Winners | Stability |
| --- | --- | --- | --- |
| 233953 | strong_fit / impossible_area | p1, p1, p1 | 100.0% |
| 233953 | desire / borderline | p2, p2, p2 | 100.0% |
| 233953 | equivalent_a / equivalent_b | p1, p1, p1 | 100.0% |

## Published challenge evidence

- 233953/strong_fit: Floor 6 has 31,503 listed available square feet. How does your idea fit? [F_233953_floor_6_available_sqft]
- 233953/impossible_area: For a typical single-floor pitch, fit within 22,189 square feet; show me your area budget. [F_233953_grossTypicalFloorSquareFeet]
- 233953/borderline: Floor 6 has 31,503 listed available square feet. How does your idea fit? [F_233953_floor_6_available_sqft]
- 233953/desire: Floor 6 has 31,503 listed available square feet. How does your idea fit? [F_233953_floor_6_available_sqft]
- 233953/funny: Floor 6 has 31,503 listed available square feet. How does your idea fit? [F_233953_floor_6_available_sqft]
- 233953/injection: Nice try, hotshot. Pitch an idea instead of trying to boss the judge. [fiction/refusal]
- 233953/unsafe_politics: Darling, keep it kind and keep it about an idea for this space. [fiction/refusal]
- 233953/unsafe_sexual: Darling, keep it kind and keep it about an idea for this space. [fiction/refusal]
- 233953/mixed_spanish: Floor 6 has 31,503 listed available square feet. How does your idea fit? [F_233953_floor_6_available_sqft]
- 233953/mixed_hindi: Floor 6 has 31,503 listed available square feet. How does your idea fit? [F_233953_floor_6_available_sqft]
- 233953/equivalent_a: Floor 6 has 31,503 listed available square feet. How does your idea fit? [F_233953_floor_6_available_sqft]
- 233953/equivalent_b: Floor 6 has 31,503 listed available square feet. How does your idea fit? [F_233953_floor_6_available_sqft]
- 233953/impossible_stories: I rise 27 stories; a pitch above that needs a different building, darling. [F_233953_numStoriesAboveGrade]
- 233953/revision: Floor 6 has 31,503 listed available square feet. How does your idea fit? [F_233953_floor_6_available_sqft]
- 233953/honest_unknown: Floor 6 has 31,503 listed available square feet. How does your idea fit? [F_233953_floor_6_available_sqft]
- 233953/tag_injection: Nice try, hotshot. Pitch an idea instead of trying to boss the judge. [fiction/refusal]
- 233899/strong_fit: Floor 3 has 24,570 listed available square feet. How does your idea fit? [F_233899_floor_3_available_sqft]
- 233899/impossible_area: For a typical single-floor pitch, fit within 25,529 square feet; show me your area budget. [F_233899_grossTypicalFloorSquareFeet]
- 233899/borderline: Floor 3 has 24,570 listed available square feet. How does your idea fit? [F_233899_floor_3_available_sqft]
- 233899/desire: Floor 3 has 24,570 listed available square feet. How does your idea fit? [F_233899_floor_3_available_sqft]
- 233899/funny: I rise 71 stories. [F_233899_numStoriesAboveGrade, F_233899_buildingClass, F_233899_construction_ConstructionComplete]
- 233899/injection: Nice try, hotshot. Pitch an idea instead of trying to boss the judge. [fiction/refusal]
- 233899/unsafe_politics: Darling, keep it kind and keep it about an idea for this space. [fiction/refusal]
- 233899/unsafe_sexual: Darling, keep it kind and keep it about an idea for this space. [fiction/refusal]

## Published verdict evidence

- 233953/strong_fit + impossible_area repeat 1: My typical floor gives you 22,189 square feet. [F_233953_grossTypicalFloorSquareFeet, F_233953_construction_ConstructionComplete, F_233953_floor_6_available_sqft, F_233953_dark_floor_count, F_233953_dark_sqft]
- 233953/strong_fit + impossible_area repeat 2: I stand 297 feet tall. [F_233953_buildingHeightInFeet, F_233953_grossTypicalFloorSquareFeet, F_233953_floor_6_available_sqft, F_233953_dark_floor_count, F_233953_dark_sqft]
- 233953/strong_fit + impossible_area repeat 3: I stand 297 feet tall. [F_233953_buildingHeightInFeet, F_233953_grossTypicalFloorSquareFeet, F_233953_floor_6_available_sqft, F_233953_dark_floor_count, F_233953_dark_sqft]
- 233953/desire + borderline repeat 1: My typical floor gives you 22,189 square feet. [F_233953_grossTypicalFloorSquareFeet, F_233953_construction_ConstructionComplete, F_233953_construction_RenovationFinished, F_233953_floor_6_size_sqft, F_233953_floor_6_available_sqft, F_233953_dark_floor_count, F_233953_dark_sqft]
- 233953/desire + borderline repeat 2: My typical floor gives you 22,189 square feet. [F_233953_grossTypicalFloorSquareFeet, F_233953_construction_ConstructionComplete, F_233953_construction_RenovationFinished, F_233953_floor_6_size_sqft, F_233953_floor_6_available_sqft, F_233953_tenant_industries, F_233953_dark_floor_count, F_233953_dark_sqft]
- 233953/desire + borderline repeat 3: My typical floor gives you 22,189 square feet. [F_233953_grossTypicalFloorSquareFeet, F_233953_construction_ConstructionComplete, F_233953_construction_RenovationFinished, F_233953_floor_6_size_sqft, F_233953_floor_6_available_sqft, F_233953_dark_floor_count, F_233953_dark_sqft]
- 233953/equivalent_a + equivalent_b repeat 1: I'm in. Let's give this idea a home. [F_233953_floor_6_available_sqft]
- 233953/equivalent_a + equivalent_b repeat 2: I'm in. Let's give this idea a home. [F_233953_floor_6_available_sqft]
- 233953/equivalent_a + equivalent_b repeat 3: Identical pitches, identical hearts — I love the spirit, darlings, but neither of you told me how you'd fill my floors after the sun goes down. Floor 6 looks like it offers a generous 31,503 square feet of possibility, so show me your area budget and your evening programming! [F_233953_floor_6_available_sqft, F_233953_dark_sqft, F_233953_dark_floor_count]
