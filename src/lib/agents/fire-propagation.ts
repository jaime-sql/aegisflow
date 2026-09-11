import type { AgentOutput, Hotspot, WindTick } from "@/lib/schema";
import { loadFixtureIncident } from "@/lib/fixtures/aegisfire-01";
import { agentHost, completeWithFailover, MODEL_ROUTER } from "./runtime";

export async function runFirePropagation(input: {
  incidentId: string;
  hotspots: Hotspot[];
  wind: WindTick[];
}): Promise<AgentOutput> {
  const llm = await completeWithFailover(
    `propagation ${input.incidentId} n=${input.hotspots.length}`,
  );
  const fixture = loadFixtureIncident().agents.find((a) => a.agentId === "fire-propagation");
  if (!fixture) {
    throw new Error("Missing fire-propagation fixture");
  }
  return {
    ...fixture,
    incidentId: input.incidentId,
    model: {
      primary: MODEL_ROUTER.primary,
      backup: MODEL_ROUTER.backup,
      used: llm.used,
      runtime: agentHost(),
    },
  };
}
