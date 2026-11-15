export interface AgentStep { step: string; tool: string; summary: string; duration_ms: number }
export interface RecordedTrace {
  building_id: string; available: boolean; events: AgentStep[]; files: string[];
  plan_recorded: boolean; model_ids: string[]; configured_model_ids: string[]; notes: string[];
}

const steps = new Set(["research", "property_scout", "spatial_scout", "persona_writer", "complete", "validation", "fallback", "challenge", "verdict", "claim_check", "invalid_schema"]);
const tools = new Set(["write_todos", "task", "write_file", "read_file", "edit_file", "ls", "glob", "grep", "kit_get_building", "kit_get_floor_status", "kit_get_tenant_history", "kit_get_matterport_models", "vexcel_property", "vexcel_imagery", "vexcel_detect", "matterport_get_model", "validate_persona", "retry", "fake_agent", "bedrock_challenge", "bedrock_verdict", "bedrock_claim_check", "get_fact", "search_facts", "challenge", "verdict", "claim_check"]);
const causes = new Set(["budget", "unavailable", "timeout", "invalid_schema", "fact_id", "number_match", "claim_check", "safety"]);

/** Live events contain public metadata; reconstruct summaries rather than trusting free text. */
export function publicStep(row: AgentStep): AgentStep | null {
  if (!steps.has(row.step) || !tools.has(row.tool) || !Number.isInteger(row.duration_ms) || row.duration_ms < 0) return null;
  const cause = typeof row.summary === "string" ? /\(([a-z_]+)\)$/.exec(row.summary)?.[1] : undefined;
  return { step: row.step, tool: row.tool, duration_ms: row.duration_ms,
    summary: `${row.step}: ${row.tool}${row.step === "fallback" && cause && causes.has(cause) ? ` (${cause})` : ""}` };
}

export function appendStep(history: AgentStep[], row: AgentStep): AgentStep[] {
  const safe = publicStep(row);
  return safe ? [...history.slice(-119), safe] : history;
}

export function replayThrough(events: AgentStep[], count: number): AgentStep[] {
  return events.slice(0, Math.max(0, Math.floor(count)));
}
