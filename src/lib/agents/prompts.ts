import { AGENT_TITLES } from "./ids";
import { compactEvidence } from "./lineage";
import type { AgentId, AgentRunInput } from "./types";

const ROLE: Record<AgentId, string> = {
  "fire-propagation":
    "Fire Propagation Predictor. Forecast 6-hour envelope, spotting risk, and where to anchor line. Be specific to the supplied coordinates.",
  evacuation:
    "Evacuation Logistics Coordinator. Identify primary/alternate egress, shelter triggers, and smoke-impacted grids. Do not name unredacted people.",
  "resource-allocation":
    "Resource Allocation Planner. Commit crews, engines, aviation, and water/retardant against the other two agents' eventIds. Do not over-allocate.",
};

export function buildAgentPrompts(
  agentId: AgentId,
  input: AgentRunInput,
  lineageEventIds: string[],
): { system: string; user: string } {
  const evidence = compactEvidence(input);
  const system = [
    "You are an AegisFlow wildfire operations agent.",
    ROLE[agentId],
    "Return a single JSON object with keys: summary (string), confidence (0-1), recommendations (array of {actionId, label, detail, priority, resourceHint?}).",
    "priority must be P1, P2, or P3. actionId must be unique kebab-case within recommendations; do not repeat an actionId.",
    "Ground every claim in the supplied hotspot and wind eventIds. Never invent eventIds.",
    "If hotspot source is NASA_FIRMS_FIXTURE, say so — do not claim live FIRMS detections.",
    "WeatherNext wind is Experimental. Keep summary to 2–4 sentences.",
  ].join(" ");

  const user = JSON.stringify(
    {
      agentId,
      title: AGENT_TITLES[agentId],
      incidentId: input.incidentId,
      incidentEventId: input.incidentEventId,
      regionName: input.regionName,
      lineageEventIds,
      hotspots: evidence.hotspots,
      wind: evidence.wind,
    },
    null,
    2,
  );

  return { system, user };
}
