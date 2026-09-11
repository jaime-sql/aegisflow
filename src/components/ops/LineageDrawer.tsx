"use client";

import Link from "next/link";
import type { AgentOutput } from "@/lib/schema";
import type { OpsRole } from "@/lib/auth/roles";
import { agentShortName } from "@/lib/ui/status";

export function LineageDrawer({
  agent,
  role,
  onClose,
}: {
  agent: AgentOutput;
  role: OpsRole;
  onClose: () => void;
}) {
  return (
    <aside className="absolute inset-y-0 right-0 z-[600] flex w-[400px] max-w-full flex-col border-l border-[#1E2A40] bg-[#121A2B] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#1E2A40] px-4 py-3">
        <h2 className="text-sm font-semibold">
          Lineage — Agent · {agentShortName(agent.agentId)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[11px] text-[#8B9BB8] hover:text-[#E8EEF9]"
        >
          Close
        </button>
      </div>
      <div className="ops-scroll flex-1 space-y-3 overflow-y-auto px-4 py-3 text-[12px]">
        <p className="font-mono text-[11px] text-[#3DB9FF]">{agent.eventId}</p>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8]">
            Inputs
          </div>
          <ul className="mt-1 space-y-1">
            {agent.lineage.map((src) => (
              <li key={src.eventId}>
                <span className="text-[#8B9BB8]">{src.kind}</span> · {src.label}
                <div className="font-mono text-[10px] text-[#3DB9FF]">{src.eventId}</div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8]">
            Model
          </div>
          <p className="mt-1">
            OpenAI (primary) / DeepSeek (backup) · used {agent.model.used} · {agent.model.runtime}
          </p>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8]">
            Output
          </div>
          <p className="mt-1 font-mono text-[11px]">
            {agent.outputHash} · {agent.producedAt.replace(".000Z", "Z")}
          </p>
          <p className="mt-2 leading-relaxed text-[#8B9BB8]">{agent.summary}</p>
        </div>
        {role === "manager" && (
          <Link
            href="/fabric"
            className="inline-block font-mono text-[11px] uppercase tracking-wider text-[#FF4D2E] hover:underline"
          >
            Open in Fabric twin →
          </Link>
        )}
      </div>
    </aside>
  );
}
