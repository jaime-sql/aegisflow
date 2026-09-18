import { SCHEMA_VERSION, type AgentOutput } from "@/lib/schema";
import { AGENT_TITLES, agentEventId } from "./ids";
import { fixtureBodyFor } from "./fixtures";
import { buildLineage, compactEvidence } from "./lineage";
import { buildAgentPrompts } from "./prompts";
import {
  MODEL_ROUTER,
  agentHost,
  completeJsonWithFailover,
  envOf,
  fixtureConfidenceCap,
  invokeModal,
  liveLlmEnabled,
  modalEnabled,
  outputHash,
  parseAgentJson,
} from "./runtime";
import type { AgentId, AgentRunInput, AgentRunResult, AgentRuntimeDeps } from "./types";

function nowIso(deps: AgentRuntimeDeps): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

function usedFromUnknown(value: unknown): "openai" | "deepseek" | undefined {
  if (value === "openai" || value === "deepseek") return value;
  return undefined;
}

function liveFromModalPayload(payload: unknown): {
  summary: string;
  confidence: number;
  recommendations: AgentOutput["recommendations"];
  used?: "openai" | "deepseek";
} {
  if (!payload || typeof payload !== "object") {
    throw new Error("Modal returned a non-object");
  }
  const rec = payload as Record<string, unknown>;
  const inner =
    rec.summary && rec.recommendations
      ? rec
      : rec.output && typeof rec.output === "object"
        ? (rec.output as Record<string, unknown>)
        : rec;
  const parsed = parseAgentJson(JSON.stringify(inner));
  const used =
    usedFromUnknown(rec.used) ??
    usedFromUnknown((rec.model as { used?: unknown } | undefined)?.used);
  return { ...parsed, used };
}

function assemble(args: {
  agentId: AgentId;
  input: AgentRunInput;
  summary: string;
  confidence: number;
  recommendations: AgentOutput["recommendations"];
  used: AgentOutput["model"]["used"];
  runtime: AgentOutput["model"]["runtime"];
  degraded?: boolean;
  producedAt: string;
}): AgentOutput {
  const lineage = buildLineage(args.agentId, args.input);
  const eventId = agentEventId(args.input.incidentId, args.agentId);
  const confidence = fixtureConfidenceCap(args.confidence, Boolean(args.degraded));
  return {
    eventId,
    schemaVersion: SCHEMA_VERSION,
    agentId: args.agentId,
    incidentId: args.input.incidentId,
    title: AGENT_TITLES[args.agentId],
    confidence,
    outputHash: outputHash({
      agentId: args.agentId,
      incidentId: args.input.incidentId,
      summary: args.summary,
      recommendations: args.recommendations,
      lineageEventIds: lineage.map((l) => l.eventId),
      used: args.used,
    }),
    summary: args.summary,
    recommendations: args.recommendations,
    lineage,
    model: {
      primary: MODEL_ROUTER.primary,
      backup: MODEL_ROUTER.backup,
      used: args.used,
      runtime: args.runtime,
    },
    producedAt: args.producedAt,
    ...(args.degraded ? { degraded: true } : {}),
  };
}

function fixtureResult(
  agentId: AgentId,
  input: AgentRunInput,
  deps: AgentRuntimeDeps,
  extras: { liveAttempted: boolean; error?: string; runtime?: AgentOutput["model"]["runtime"] },
): AgentRunResult {
  const body = fixtureBodyFor(agentId, input);
  const env = envOf(deps);
  return {
    liveAttempted: extras.liveAttempted,
    liveOk: false,
    error: extras.error,
    output: assemble({
      agentId,
      input,
      summary: body.summary,
      confidence: body.confidence,
      recommendations: body.recommendations,
      used: "fixture",
      runtime: extras.runtime ?? agentHost(env),
      degraded: extras.liveAttempted,
      producedAt: nowIso(deps),
    }),
  };
}

/**
 * One Ops agent. IDs + lineage are owned here so Modal/LLM cannot mint a
 * parallel eventId space. Content comes from Modal, then local LLM, then fixture.
 */
export async function runOneAgent(
  agentId: AgentId,
  input: AgentRunInput,
  deps: AgentRuntimeDeps = {},
): Promise<AgentRunResult> {
  const env = envOf(deps);
  const producedAt = nowIso(deps);
  const eventId = agentEventId(input.incidentId, agentId);
  const lineage = buildLineage(agentId, input);
  const prompts = buildAgentPrompts(
    agentId,
    input,
    lineage.map((l) => l.eventId),
  );
  const evidence = compactEvidence(input);

  if (env.AEGISFLOW_FAIL_AGENTS === "true") {
    return fixtureResult(agentId, input, deps, {
      liveAttempted: true,
      error: "forced agent adapter failure",
      runtime: "local",
    });
  }

  if (modalEnabled(env)) {
    const modal = await invokeModal(
      {
        schemaVersion: SCHEMA_VERSION,
        agentId,
        incidentId: input.incidentId,
        eventId,
        title: AGENT_TITLES[agentId],
        lineage,
        hotspots: evidence.hotspots,
        wind: evidence.wind,
        prompt: prompts,
      },
      deps,
    );
    if (modal.ok) {
      try {
        const live = liveFromModalPayload(modal.payload);
        const used = live.used ?? "openai";
        return {
          liveAttempted: true,
          liveOk: true,
          output: assemble({
            agentId,
            input,
            summary: live.summary,
            confidence: live.confidence,
            recommendations: live.recommendations,
            used,
            runtime: "modal",
            producedAt,
          }),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "invalid Modal payload";
        if (!liveLlmEnabled(env)) {
          return fixtureResult(agentId, input, deps, {
            liveAttempted: true,
            error: `Modal payload: ${message}`,
            runtime: "modal",
          });
        }
      }
    } else if (!liveLlmEnabled(env)) {
      return fixtureResult(agentId, input, deps, {
        liveAttempted: true,
        error: modal.error,
        runtime: "modal",
      });
    }
  }

  if (liveLlmEnabled(env)) {
    const llm = await completeJsonWithFailover(
      [
        { role: "system", content: prompts.system },
        { role: "user", content: prompts.user },
      ],
      deps,
    );
    if (llm.text && (llm.used === "openai" || llm.used === "deepseek")) {
      try {
        const live = parseAgentJson(llm.text);
        return {
          liveAttempted: true,
          liveOk: true,
          output: assemble({
            agentId,
            input,
            summary: live.summary,
            confidence: live.confidence,
            recommendations: live.recommendations,
            used: llm.used,
            runtime: "local",
            producedAt,
          }),
        };
      } catch (err) {
        return fixtureResult(agentId, input, deps, {
          liveAttempted: true,
          error: err instanceof Error ? err.message : "invalid LLM JSON",
          runtime: "local",
        });
      }
    }
    return fixtureResult(agentId, input, deps, {
      liveAttempted: true,
      error: llm.error ?? "LLM returned no text",
      runtime: agentHost(env),
    });
  }

  return fixtureResult(agentId, input, deps, { liveAttempted: false });
}
