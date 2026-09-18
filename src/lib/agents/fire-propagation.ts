import type { AgentOutput } from "@/lib/schema";
import { runOneAgent } from "./compose";
import type { AgentRunInput, AgentRuntimeDeps } from "./types";

export async function runFirePropagation(
  input: AgentRunInput,
  deps: AgentRuntimeDeps = {},
): Promise<AgentOutput> {
  return (await runOneAgent("fire-propagation", input, deps)).output;
}
