import type { AgentOutput, Hotspot, WindTick } from "@/lib/schema";
import { loadFixtureIncident } from "@/lib/fixtures/aegisfire-01";
import { agentHost, completeWithFailover, MODEL_ROUTER } from "./runtime";

export async function runResourceAllocation(input: {
  incidentId: string;
  hotspots: Hotspot[];
  wind: WindTick[];
}): Promise<AgentOutput> {
  const llm = await completeWithFailover(
    `resources ${input.incidentId} n=${input.hotspots.length} wind=${input.wind.length}`,
  );
  const fixture = loadFixtureIncident().agents.find((a) => a.agentId === "resource-allocation");
  if (!fixture) {
    throw new Error("Missing resource-allocation fixture");
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
