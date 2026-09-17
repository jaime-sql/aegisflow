import { createHash } from "node:crypto";
import type { AgentOutput, DispatchAction } from "@/lib/schema";
import { DispatchActionSchema } from "@/lib/schema/zod";
import type { IngestEnv } from "@/lib/ingest/types";
import type { AgentId, AgentRuntimeDeps, LlmCompletion, ModalInvokeResult } from "./types";

export type LlmUsed = AgentOutput["model"]["used"];
export type AgentHost = AgentOutput["model"]["runtime"];

export const MODEL_ROUTER = {
  primary: "openai" as const,
  backup: "deepseek" as const,
};

export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_MODEL = "gpt-4o-mini";
export const DEEPSEEK_MODEL = "deepseek-chat";
export const DEFAULT_DEEPSEEK_BASE = "https://api.deepseek.com";

const LLM_TIMEOUT_MS = 12_000;
const MODAL_TIMEOUT_MS = 20_000;

export function envOf(deps: AgentRuntimeDeps = {}): IngestEnv {
  return deps.env ?? process.env;
}

export function agentHost(env: IngestEnv = process.env): AgentHost {
  return env.MODAL_ENDPOINT?.trim() ? "modal" : "local";
}

export function liveLlmEnabled(env: IngestEnv): boolean {
  if (env.AEGISFLOW_USE_AGENT_FIXTURE === "true") return false;
  if (env.AEGISFLOW_LIVE_LLM === "false") return false;
  if (env.AEGISFLOW_FAIL_AGENTS === "true") return false;
  return Boolean(env.OPENAI_API_KEY?.trim() || env.DEEPSEEK_API_KEY?.trim());
}

export function modalEnabled(env: IngestEnv): boolean {
  if (env.AEGISFLOW_USE_AGENT_FIXTURE === "true") return false;
  if (env.AEGISFLOW_FAIL_AGENTS === "true") return false;
  return Boolean(env.MODAL_ENDPOINT?.trim());
}

export function deepseekBaseUrl(env: IngestEnv): string {
  return (env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE).replace(/\/$/, "");
}

export function outputHash(parts: {
  agentId: AgentId;
  incidentId: string;
  summary: string;
  recommendations: DispatchAction[];
  lineageEventIds: string[];
  used: LlmUsed;
}): string {
  const payload = JSON.stringify(parts);
  return `out_${createHash("sha256").update(payload).digest("hex").slice(0, 12)}`;
}

export function modalAuthHeaders(env: IngestEnv): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const id = env.MODAL_TOKEN_ID?.trim();
  const secret = env.MODAL_TOKEN_SECRET?.trim();
  if (id && secret) {
    headers["Modal-Key"] = id;
    headers["Modal-Secret"] = secret;
    headers.Authorization = `Bearer ${id}.${secret}`;
  }
  return headers;
}

type ChatMessage = { role: "system" | "user"; content: string };

async function postChat(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  doFetch: NonNullable<AgentRuntimeDeps["fetch"]>,
): Promise<string> {
  const res = await doFetch(url, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("LLM returned empty content");
  return text;
}

/**
 * OpenAI primary / DeepSeek backup. Live calls only when keys are present
 * (and not force-fixtured). Missing keys → fixture, no network.
 */
export async function completeWithFailover(
  prompt: string,
  deps: AgentRuntimeDeps = {},
): Promise<LlmCompletion> {
  const env = envOf(deps);
  if (!liveLlmEnabled(env)) {
    return { used: "fixture", text: null };
  }
  return completeJsonWithFailover(
    [{ role: "user", content: prompt }],
    deps,
  );
}

export async function completeJsonWithFailover(
  messages: ChatMessage[],
  deps: AgentRuntimeDeps = {},
): Promise<LlmCompletion> {
  const env = envOf(deps);
  if (!liveLlmEnabled(env)) {
    return { used: "fixture", text: null };
  }
  const doFetch = deps.fetch ?? fetch;
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const deepseekKey = env.DEEPSEEK_API_KEY?.trim();
  const errors: string[] = [];

  if (openaiKey) {
    try {
      const text = await postChat(OPENAI_CHAT_URL, openaiKey, OPENAI_MODEL, messages, doFetch);
      return { used: "openai", text };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "openai failed");
    }
  }

  if (deepseekKey) {
    try {
      const text = await postChat(
        `${deepseekBaseUrl(env)}/chat/completions`,
        deepseekKey,
        DEEPSEEK_MODEL,
        messages,
        doFetch,
      );
      return { used: "deepseek", text };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "deepseek failed");
    }
  }

  return {
    used: "fixture",
    text: null,
    error: errors.join("; ") || "no LLM keys",
  };
}

export type ModalRequest = {
  schemaVersion: string;
  agentId: AgentId;
  incidentId: string;
  eventId: string;
  title: string;
  lineage: { eventId: string; kind: string; label: string }[];
  hotspots: unknown[];
  wind: unknown[];
  prompt: { system: string; user: string };
};

export async function invokeModal(
  request: ModalRequest,
  deps: AgentRuntimeDeps = {},
): Promise<ModalInvokeResult> {
  const env = envOf(deps);
  const endpoint = env.MODAL_ENDPOINT?.trim();
  if (!endpoint || !modalEnabled(env)) {
    return { ok: false, error: "modal disabled" };
  }
  const doFetch = deps.fetch ?? fetch;
  try {
    const res = await doFetch(endpoint, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(MODAL_TIMEOUT_MS),
      headers: modalAuthHeaders(env),
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      return { ok: false, error: `Modal HTTP ${res.status}` };
    }
    const payload: unknown = await res.json();
    return { ok: true, payload };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "modal failed" };
  }
}

export function parseAgentJson(text: string): {
  summary: string;
  confidence: number;
  recommendations: DispatchAction[];
} {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const parsed: unknown = JSON.parse(stripped);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("LLM JSON was not an object");
  }
  const rec = parsed as Record<string, unknown>;
  const summary = typeof rec.summary === "string" ? rec.summary.trim() : "";
  if (summary.length < 8) throw new Error("LLM summary too short");
  const confidenceRaw = typeof rec.confidence === "number" ? rec.confidence : 0.6;
  const confidence = Math.min(0.95, Math.max(0, confidenceRaw));
  if (!Array.isArray(rec.recommendations) || rec.recommendations.length === 0) {
    throw new Error("LLM recommendations missing");
  }
  const recommendations = rec.recommendations.slice(0, 6).map((row, index) => {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const actionIdRaw =
      typeof item.actionId === "string" && item.actionId.trim()
        ? item.actionId
        : `action-${index + 1}`;
    const actionId = actionIdRaw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `action-${index + 1}`;
    const priority =
      item.priority === "P1" || item.priority === "P2" || item.priority === "P3"
        ? item.priority
        : "P2";
    return DispatchActionSchema.parse({
      actionId,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : `Action ${index + 1}`,
      detail:
        typeof item.detail === "string" && item.detail.trim()
          ? item.detail.trim()
          : "See incident snapshot.",
      priority,
      resourceHint: typeof item.resourceHint === "string" ? item.resourceHint : undefined,
    });
  });
  return { summary, confidence, recommendations };
}

export function fixtureConfidenceCap(confidence: number, degraded: boolean): number {
  if (!degraded) return confidence;
  return Math.min(confidence, 0.4);
}

