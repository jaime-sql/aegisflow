import type { AgentOutput } from "@/lib/schema";
import { runOneAgent } from "./compose";
import type { AgentRunInput, AgentRuntimeDeps } from "./types";

export async function runEvacuation(
  input: AgentRunInput,
  deps: AgentRuntimeDeps = {},
): Promise<AgentOutput> {
  return (await runOneAgent("evacuation", input, deps)).output;
}
