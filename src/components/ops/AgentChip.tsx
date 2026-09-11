import type { AgentOutput } from "@/lib/schema";
import { agentShortName } from "@/lib/ui/status";

export function AgentChip({
  agent,
  active,
  onSelect,
}: {
  agent: AgentOutput;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left ${
        active
          ? "border-[#3DB9FF] bg-[#162033]"
          : "border-[#1E2A40] bg-[#0B1220] hover:border-[#3DB9FF]/50"
      }`}
    >
      <span className="flex items-center gap-2 text-[12px]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#FF4D2E]" />
        {agentShortName(agent.agentId)}
      </span>
      <span className="font-mono text-[11px] text-[#8B9BB8]">
        conf {agent.confidence.toFixed(2)}
      </span>
    </button>
  );
}
