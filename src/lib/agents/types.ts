import type { AgentOutput, Hotspot, WindTick } from "@/lib/schema";
import type { IngestEnv, IngestFetch } from "@/lib/ingest/types";

export type AgentId = AgentOutput["agentId"];

export type AgentRunInput = {
  incidentId: string;
  incidentEventId?: string;
  regionName?: string;
  hotspots: Hotspot[];
  wind: WindTick[];
};

export type AgentRuntimeDeps = {
  fetch?: IngestFetch;
  env?: IngestEnv;
  now?: () => Date;
};

export type AgentRunResult = {
  output: AgentOutput;
  liveAttempted: boolean;
  liveOk: boolean;
  error?: string;
};

export type LlmCompletion = {
  used: AgentOutput["model"]["used"];
  text: string | null;
  error?: string;
};

export type ModalInvokeResult = {
  ok: boolean;
  used?: "openai" | "deepseek" | "fixture";
  payload?: unknown;
  error?: string;
};
