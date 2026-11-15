import { expect, it } from "vitest";
import { initialGame, reduce } from "../lib/store";
import { appendStep, publicStep, replayThrough } from "./trace-model";

const step = { step: "challenge", tool: "bedrock_challenge", summary: "private prompt", duration_ms: 12 };

it("projects safe live tool metadata and only known fallback causes", () => {
  expect(publicStep(step)?.summary).toBe("challenge: bedrock_challenge");
  expect(publicStep({ ...step, step: "fallback", tool: "verdict", summary: "fallback: verdict (budget)" })?.summary).toBe("fallback: verdict (budget)");
  expect(publicStep({ ...step, tool: "private_key" })).toBeNull();
  expect(publicStep({ ...step, duration_ms: -1 })).toBeNull();
});

it("shows the live judge's dossier lookups without their free-text arguments", () => {
  expect(publicStep({ ...step, tool: "get_fact", summary: "challenge: get_fact(F_1)" })?.summary).toBe("challenge: get_fact");
  expect(publicStep({ ...step, step: "verdict", tool: "search_facts", summary: "private query" })?.summary).toBe("verdict: search_facts");
});

it("bounds live history and clears it when a new round starts or resets", () => {
  const history = Array.from({ length: 120 }, () => step);
  expect(appendStep(history, step)).toHaveLength(120);
  const active = { ...initialGame, roundId: "one", agentSteps: history };
  expect(reduce(active, { type: "round_started", round_id: "two", building_id: "233953", target_floors: [6] }).agentSteps).toEqual([]);
  expect(reduce(active, { type: "phase_changed", phase: "EXPLORE", round_id: null, ends_at: null }).agentSteps).toEqual([]);
  expect(reduce(initialGame, { type: "agent_step", ...step })).toEqual({});
  expect(reduce(active, { type: "agent_step", ...step }).agentSteps?.at(-1)?.summary).toBe("challenge: bedrock_challenge");
});

it("replays in recorded order without inventing intermediate events", () => {
  expect(replayThrough([step, step], 1)).toEqual([step]);
  expect(replayThrough([step], 99)).toEqual([step]);
  expect(replayThrough([step], -1)).toEqual([]);
});
