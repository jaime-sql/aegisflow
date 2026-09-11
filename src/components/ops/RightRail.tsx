"use client";

import { useMemo, useState } from "react";
import type { DispatchAction, IncidentEvent } from "@/lib/schema";
import { canDispatch, type OpsRole } from "@/lib/auth/roles";

function Section({
  title,
  eventId,
  children,
}: {
  title: string;
  eventId?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[#1c2533] px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8b98a8]">
          {title}
        </h2>
        {eventId ? (
          <span className="truncate font-mono text-[10px] text-[#5ce1e6]">{eventId}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ResourceBarRow({
  label,
  allocated,
  available,
}: {
  label: string;
  allocated: number;
  available: number;
}) {
  const pct = available === 0 ? 0 : Math.round((allocated / available) * 100);
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-[11px]">
        <span>{label}</span>
        <span className="font-mono text-[#8b98a8]">
          {allocated}/{available} · {pct}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#1c2533]">
        <div
          className="h-full rounded-full bg-[#ff6b2c]"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function RightRail({
  incident,
  role,
}: {
  incident: IncidentEvent;
  role: OpsRole;
}) {
  const unlocked = canDispatch(role);
  const [queued, setQueued] = useState<string[]>([]);

  const actions = useMemo(() => {
    const rows: Array<DispatchAction & { agent: string; agentEventId: string }> = [];
    for (const agent of incident.agents) {
      for (const rec of agent.recommendations) {
        rows.push({ ...rec, agent: agent.title, agentEventId: agent.eventId });
      }
    }
    return rows;
  }, [incident.agents]);

  return (
    <aside className="ops-scroll h-full overflow-y-auto border-l border-[#1c2533] bg-[#0e1218]">
      <Section title="Exec summary" eventId={incident.eventId}>
        <p className="text-[13px] leading-relaxed text-[#d5dde8]">
          {incident.executiveSummary}
        </p>
        <p className="mt-2 font-mono text-[10px] text-[#8b98a8]">
          {incident.incidentId} · {incident.hotspots.length} hotspots ·{" "}
          {incident.wind.length} wind ticks
        </p>
      </Section>

      <Section title="Agent lineage">
        <div className="flex flex-col gap-2">
          {incident.agents.map((agent) => (
            <div
              key={agent.eventId}
              className="rounded-md border border-[#1c2533] bg-[#121821] p-2"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{agent.title}</span>
                <span className="rounded bg-[#1c2533] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#5ce1e6]">
                  {agent.model.used} · {agent.model.runtime}
                </span>
              </div>
              <p className="mb-2 text-[11px] leading-snug text-[#8b98a8]">{agent.summary}</p>
              <div className="flex flex-wrap gap-1">
                {agent.lineage.map((src) => (
                  <span
                    key={`${agent.eventId}-${src.eventId}`}
                    title={src.label}
                    className="rounded-full border border-[#1c2533] px-2 py-0.5 font-mono text-[9px] text-[#c9d4e0]"
                  >
                    {src.kind}:{src.eventId.replace("evt_aegisfire01_", "")}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Dispatch recommendations">
        {!unlocked && (
          <p className="mb-2 text-[11px] text-[#f5c542]">
            Viewer role: actions stay visible but locked. Emergency Manager can commit.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {actions.map((action) => {
            const isQueued = queued.includes(action.actionId);
            return (
              <li
                key={action.actionId}
                className="rounded-md border border-[#1c2533] bg-[#121821] p-2"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-[9px] text-[#ff6b2c]">{action.priority}</span>
                  <span className="text-[12px] font-medium">{action.label}</span>
                </div>
                <p className="mb-2 text-[11px] text-[#8b98a8]">{action.detail}</p>
                <button
                  type="button"
                  disabled={!unlocked || isQueued}
                  onClick={() => setQueued((q) => [...q, action.actionId])}
                  className={`flex w-full items-center justify-center gap-2 rounded border px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider ${
                    !unlocked
                      ? "cursor-not-allowed border-[#2a3545] text-[#8b98a8] opacity-70"
                      : isQueued
                        ? "border-[#3dd68c]/40 text-[#3dd68c]"
                        : "border-[#ff6b2c]/50 text-[#ff6b2c] hover:bg-[#ff6b2c]/10"
                  }`}
                >
                  {!unlocked ? (
                    <>
                      <LockIcon /> Locked · {action.actionId}
                    </>
                  ) : isQueued ? (
                    "Queued (demo)"
                  ) : (
                    `Commit · ${action.actionId}`
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Resources">
        {incident.resources.map((r) => (
          <ResourceBarRow
            key={r.id}
            label={r.label}
            allocated={r.allocated}
            available={r.available}
          />
        ))}
      </Section>

      <Section title="Data stream / timeline" eventId={incident.feedHealth.eventId}>
        <ol className="relative ml-1 border-l border-[#1c2533] pl-3">
          {incident.timeline.map((item) => (
            <li key={item.eventId} className="mb-3">
              <div className="text-[11px] font-medium">{item.label}</div>
              <div className="font-mono text-[10px] text-[#8b98a8]">
                {item.at.replace(".000Z", "Z")} · {item.kind}
                {item.kind === "sim" ? " · SIM" : ""}
              </div>
              {item.detail ? (
                <div className="text-[11px] text-[#8b98a8]">{item.detail}</div>
              ) : null}
              <div className="font-mono text-[9px] text-[#5ce1e6]">{item.eventId}</div>
            </li>
          ))}
        </ol>
      </Section>
    </aside>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5V3.5a2 2 0 1 1 4 0V5h1.2A.8.8 0 0 1 10 5.8v4.4a.8.8 0 0 1-.8.8H2.8A.8.8 0 0 1 2 10.2V5.8A.8.8 0 0 1 2.8 5H4zm1.2-1.5V5h1.6V3.5a.8.8 0 0 0-1.6 0z"
      />
    </svg>
  );
}
