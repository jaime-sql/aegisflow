import type { AgentOutput } from "@/lib/schema";
import { runOneAgent } from "./compose";
import type { AgentRunInput, AgentRuntimeDeps } from "./types";

export async function runResourceAllocation(
  input: AgentRunInput,
  deps: AgentRuntimeDeps = {},
): Promise<AgentOutput> {
  return (await runOneAgent("resource-allocation", input, deps)).output;
}
