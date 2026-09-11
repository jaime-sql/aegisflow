import type { AgentOutput, FeedComponent, Hotspot, WindTick } from "@/lib/schema";
import { runEvacuation } from "./evacuation";
import { runFirePropagation } from "./fire-propagation";
import { runResourceAllocation } from "./resource-allocation";
import { agentHost } from "./runtime";

export { runEvacuation, runFirePropagation, runResourceAllocation };
export { agentHost, completeWithFailover, MODEL_ROUTER } from "./runtime";

export async function runAllAgents(input: {
  incidentId: string;
  hotspots: Hotspot[];
  wind: WindTick[];
}): Promise<{ agents: AgentOutput[]; health: FeedComponent }> {
  const now = new Date().toISOString();
  try {
    const [propagation, evacuation, resources] = await Promise.all([
      runFirePropagation(input),
      runEvacuation(input),
      runResourceAllocation(input),
    ]);
    return {
      agents: [propagation, evacuation, resources],
      health: {
        id: "agents",
        label: "Agent runtime",
        status: "ok",
        detail: `${agentHost()} stub · OpenAI primary / DeepSeek backup · ${propagation.model.used}`,
        lastSuccessAt: now,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "agent failure";
    return {
      agents: [],
      health: {
        id: "agents",
        label: "Agent runtime",
        status: "down",
        detail: message,
        lastSuccessAt: null,
      },
    };
  }
}
