import type { AgentOutput, DispatchAction } from "@/lib/schema";
import { loadFixtureIncident } from "@/lib/fixtures/aegisfire-01";
import { withUniqueActionIds } from "./action-ids";
import type { AgentId, AgentRunInput } from "./types";

const CASCADE_INCIDENT = "AegisFire-01";

type FixtureBody = Pick<AgentOutput, "summary" | "confidence" | "recommendations">;

const SV_WUI_BODIES: Record<AgentId, FixtureBody> = {
  "fire-propagation": {
    confidence: 0.82,
    summary:
      "El Salvador / WUI watch. Highest-FRP cells align with Experimental 10 m wind; 6-hour envelope favors downwind settlements. Treat NASA_FIRMS_FIXTURE cells as demo until live detections exist — do not brief as live FIRMS.",
    recommendations: [
      {
        actionId: "prop-hold-north",
        label: "Anchor the downwind flank before night shift",
        detail: "Construct indirect line on the hottest-FRP side while the 6h envelope is still west of dense WUI.",
        priority: "P1",
        resourceHint: "Type 1 crews",
      },
      {
        actionId: "prop-retardant",
        label: "Retardant check-line on the spotting path",
        detail: "Break spotting toward the nearest populated grid. Window: next 90 minutes on the demo clock.",
        priority: "P1",
        resourceHint: "Heavy tanker",
      },
    ],
  },
  evacuation: {
    confidence: 0.76,
    summary:
      "Primary egress follows CA-1 / Pan-American away from the hottest cells. Pre-stage a reverse-flow decision if smoke loads the San Salvador metro grid. Crowd copy is PII-scrubbed.",
    recommendations: [
      {
        actionId: "evac-hwy20",
        label: "Keep CA-1 as primary egress; hold reverse as trigger",
        detail: "Trigger: head within 3 km of dense WUI or visibility < 200 m on the metro grid.",
        priority: "P1",
        resourceHint: "Law / DOT",
      },
      {
        actionId: "evac-shelter",
        label: "Pre-open the nearest county shelter",
        detail: "Capacity planning for 1,200. Notify Protección Civil.",
        priority: "P2",
      },
    ],
  },
  "resource-allocation": {
    confidence: 0.71,
    summary:
      "Commit engines to the nearest DP on the high-FRP cell, tanker on the downwind check-line, and hold 1 Type 1 crew as IA for spots. Water tenders remain partly unallocated.",
    recommendations: [
      {
        actionId: "res-engines",
        label: "Stage 4 Type 3 engines at the lead DP",
        detail: "Do not split to the opposite drainage until the downwind flank is anchored.",
        priority: "P1",
        resourceHint: "Engines",
      },
      {
        actionId: "res-tanker",
        label: "Request 1 heavy air tanker + lead plane",
        detail: "Drop aligned with the propagation envelope.",
        priority: "P1",
        resourceHint: "Aviation",
      },
      {
        actionId: "res-crews",
        label: "2 Type 1 crews on the flank / 1 in IA reserve",
        detail: "Reserve crew covers spotting east of the check-line.",
        priority: "P2",
        resourceHint: "Hand crews",
      },
    ],
  },
};

export function fixtureBodyFor(agentId: AgentId, input: AgentRunInput): FixtureBody {
  const body =
    input.incidentId === CASCADE_INCIDENT
      ? cascadeFixtureBody(agentId)
      : SV_WUI_BODIES[agentId];
  return {
    ...body,
    recommendations: withUniqueActionIds(body.recommendations, { agentId }),
  };
}

function cascadeFixtureBody(agentId: AgentId): FixtureBody {
  const fixture = loadFixtureIncident().agents.find((a) => a.agentId === agentId);
  if (!fixture) throw new Error(`Missing ${agentId} fixture`);
  return {
    summary: fixture.summary,
    confidence: fixture.confidence,
    recommendations: fixture.recommendations as DispatchAction[],
  };
}
