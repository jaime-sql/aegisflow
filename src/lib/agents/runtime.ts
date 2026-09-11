/**
 * Stage 1 agent runtime: local deterministic fixtures.
 * Modal-ready — set MODAL_ENDPOINT later and flip host without changing agent IDs.
 * LLM router: OpenAI primary / DeepSeek backup. Live calls are opt-in.
 */

export type LlmUsed = "openai" | "deepseek" | "fixture";
export type AgentHost = "local" | "modal";

export function agentHost(): AgentHost {
  return process.env.MODAL_ENDPOINT ? "modal" : "local";
}

export async function completeWithFailover(prompt: string): Promise<{
  used: LlmUsed;
  text: string | null;
}> {
  void prompt;
  const live = process.env.AEGISFLOW_LIVE_LLM === "true";
  if (!live) {
    return { used: "fixture", text: null };
  }

  if (process.env.OPENAI_API_KEY) {
    // Stage 2: POST https://api.openai.com/v1/chat/completions
    return { used: "openai", text: null };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    // Stage 2: POST ${DEEPSEEK_BASE_URL}/chat/completions
    return { used: "deepseek", text: null };
  }
  return { used: "fixture", text: null };
}

export const MODEL_ROUTER = {
  primary: "openai" as const,
  backup: "deepseek" as const,
};
