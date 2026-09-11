"use client";

import { useMemo } from "react";
import type { AgentOutput, DispatchAction, IncidentEvent } from "@/lib/schema";
import type { OpsRole } from "@/lib/auth/roles";
import { ExecSummaryCard } from "./ExecSummaryCard";
import { AgentChip } from "./AgentChip";
import { DispatchList } from "./DispatchList";
import { ResourceBars } from "./ResourceBars";
import { TimelineScrubber } from "./TimelineScrubber";

export function RightRail({
  incident,
  role,
  selectedAgentId,
  onSelectAgent,
  onViewLineage,
}: {
  incident: IncidentEvent;
  role: OpsRole;
  selectedAgentId: string | null;
  onSelectAgent: (agent: AgentOutput) => void;
  onViewLineage: () => void;
}) {
  const actions = useMemo(() => {
    const rows: DispatchAction[] = [];
    for (const agent of incident.agents) {
      rows.push(...agent.recommendations);
    }
    return rows;
  }, [incident.agents]);

  return (
    <aside className="ops-scroll h-full overflow-y-auto border-l border-[#1E2A40] bg-[#121A2B]">
      <ExecSummaryCard incident={incident} onViewLineage={onViewLineage} />

      <section className="border-b border-[#1E2A40] px-4 py-3">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8B9BB8]">
          Agents
        </h2>
        <div className="flex flex-col gap-1.5">
          {incident.agents.map((agent) => (
            <AgentChip
              key={agent.eventId}
              agent={agent}
              active={selectedAgentId === agent.eventId}
              onSelect={() => onSelectAgent(agent)}
            />
          ))}
        </div>
      </section>

      <DispatchList actions={actions} role={role} />
      <ResourceBars resources={incident.resources} />
      <TimelineScrubber items={incident.timeline} startedAt={incident.startedAt} />
    </aside>
  );
}
