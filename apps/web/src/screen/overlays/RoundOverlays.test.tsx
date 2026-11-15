import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChallengeCards, ScoreCard } from "./RoundOverlays";
import { Pitch, Result } from "../../play/Round";
import { initialGame, useGame, type GameState } from "../../lib/store";
import { displayDialogue } from "../../lib/dialogue";
import { evidenceLine } from "../../lib/buildings";

// SSR normally reads Zustand's initial snapshot; render the arranged game state.
vi.mock("../../lib/store", async (importOriginal) => {
  const store = await importOriginal<typeof import("../../lib/store")>();
  return { ...store, useGame: Object.assign((selector?: (state: GameState) => unknown) =>
    selector ? selector(store.useGame.getState()) : store.useGame.getState(), store.useGame) };
});

afterEach(() => useGame.setState(initialGame, true));

it("hides the exact live fact-id leak on projector and phone while retaining evidence", () => {
  const line = "Floor 7 has 31,503 listed available square feet—plenty for tables, but will your crowd stay past midnight? F_233953_floor_7_available_sqft";
  const clean = line.slice(0, line.lastIndexOf(" "));
  const factIds = ["F_233953_floor_7_available_sqft"];
  useGame.setState({ ...initialGame, phase: "CHALLENGE", buildingId: "233953",
    counteroffers: { p1: { player_id: "p1", line, counteroffer: line, fact_ids: factIds, audio_url: null } },
    verdict: { round_id: "round", winner_player_id: "p1", scores: [], reason_line: line, desire_reveal: line,
      fact_ids: factIds, category: "wildcard", desire_met: false, impact: null } });
  const challenge = renderToStaticMarkup(<ChallengeCards />);
  useGame.setState({ phase: "VERDICT" });
  const verdict = renderToStaticMarkup(<ScoreCard />);
  const phone = renderToStaticMarkup(<><Pitch sock={{ current: null }} playerId="p1" revision /><Result playerId="p1" /></>);
  for (const html of [challenge, verdict, phone]) {
    expect(html).toContain(clean);
    expect(html).not.toContain(factIds[0]);
  }
  expect(challenge).toContain('aria-label="Cited evidence"');
  expect(verdict).toContain('aria-label="Cited evidence"');
  expect(useGame.getState().counteroffers.p1?.fact_ids).toEqual(factIds);
  expect(evidenceLine({ key: "floor_7_available_sqft", value: 31503, say_as: "31,503 sqft", source: "costar", kind: "verified" }))
    .toBe("CoStar · Floor 7 available: 31,503 sqft");
  expect(displayDialogue(`${line} (233953).`, "233953")).toBe(clean);
});
