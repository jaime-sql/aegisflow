import type { AgentOutput, FeedComponent, Hotspot, WindTick } from "@/lib/schema";
import { runOneAgent } from "./compose";
import { agentHost, envOf } from "./runtime";
import type { AgentRunInput, AgentRuntimeDeps } from "./types";

export { runEvacuation } from "./evacuation";
export { runFirePropagation } from "./fire-propagation";
export { runResourceAllocation } from "./resource-allocation";
export {
  agentHost,
  completeWithFailover,
  completeJsonWithFailover,
  MODEL_ROUTER,
} from "./runtime";
export { agentEventId, incidentToken } from "./ids";
export type { AgentRunInput, AgentRuntimeDeps } from "./types";

export async function runFirePropagationWithDeps(
  input: AgentRunInput,
  deps?: AgentRuntimeDeps,
): Promise<AgentOutput> {
  return (await runOneAgent("fire-propagation", input, deps)).output;
}

export async function runEvacuationWithDeps(
  input: AgentRunInput,
  deps?: AgentRuntimeDeps,
): Promise<AgentOutput> {
  return (await runOneAgent("evacuation", input, deps)).output;
}

export async function runResourceAllocationWithDeps(
  input: AgentRunInput,
  deps?: AgentRuntimeDeps,
): Promise<AgentOutput> {
  return (await runOneAgent("resource-allocation", input, deps)).output;
}

export async function runAllAgents(
  input: {
    incidentId: string;
    incidentEventId?: string;
    regionName?: string;
    hotspots: Hotspot[];
    wind: WindTick[];
  },
  deps: AgentRuntimeDeps = {},
): Promise<{ agents: AgentOutput[]; health: FeedComponent }> {
  const now = (deps.now?.() ?? new Date()).toISOString();
  const env = envOf(deps);

  try {
    const [propagation, evacuation, resources] = await Promise.all([
      runOneAgent("fire-propagation", input, deps),
      runOneAgent("evacuation", input, deps),
      runOneAgent("resource-allocation", input, deps),
    ]);
    const results = [propagation, evacuation, resources];
    const agents = results.map((r) => r.output);
    const attempted = results.some((r) => r.liveAttempted);
    const liveOk = results.filter((r) => r.liveOk);
    const errors = results.map((r) => r.error).filter((e): e is string => Boolean(e));
    const used = [...new Set(agents.map((a) => a.model.used))].join("/");
    const runtime = agents[0]?.model.runtime ?? agentHost(env);

    if (env.AEGISFLOW_FAIL_AGENTS === "true") {
      return {
        agents,
        health: {
          id: "agents",
          label: "Agent runtime",
          status: "down",
          detail: "Live pull failed (forced agent adapter failure) — fixture in use",
          lastSuccessAt: null,
        },
      };
    }

    if (attempted && liveOk.length === 0) {
      return {
        agents,
        health: {
          id: "agents",
          label: "Agent runtime",
          status: "degraded",
          detail: `Live pull failed (${errors[0] ?? "Modal/LLM error"}) — fixture in use`,
          lastSuccessAt: agents[0]?.producedAt ?? null,
        },
      };
    }

    if (attempted && liveOk.length < results.length) {
      return {
        agents,
        health: {
          id: "agents",
          label: "Agent runtime",
          status: "degraded",
          detail: `${liveOk.length}/3 live · ${used} · ${runtime} — remaining fixture`,
          lastSuccessAt: now,
        },
      };
    }

    if (liveOk.length === results.length) {
      return {
        agents,
        health: {
          id: "agents",
          label: "Agent runtime",
          status: "ok",
          detail: `${runtime} · ${used} · OpenAI primary / DeepSeek backup`,
          lastSuccessAt: now,
        },
      };
    }

    return {
      agents,
      health: {
        id: "agents",
        label: "Agent runtime",
        status: "ok",
        detail: `${runtime} fixture · no OPENAI_API_KEY / DEEPSEEK_API_KEY / MODAL_ENDPOINT`,
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
