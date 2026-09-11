"use client";

import { useState } from "react";
import type { DispatchAction } from "@/lib/schema";
import { canDispatch, type OpsRole } from "@/lib/auth/roles";

type ItemState = "open" | "acked" | "assigned";

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

export function DispatchList({
  actions,
  role,
}: {
  actions: DispatchAction[];
  role: OpsRole;
}) {
  const unlocked = canDispatch(role);
  const [state, setState] = useState<Record<string, ItemState>>({});

  return (
    <section className="border-b border-[#1E2A40] px-4 py-3">
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8B9BB8]">
        Dispatch
      </h2>
      {!unlocked && (
        <p className="mb-2 text-[11px] text-[#FFB020]">
          Viewer: Ack/Assign stay visible but locked. Emergency Manager can commit.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {actions.map((action) => {
          const st = state[action.actionId] ?? "open";
          const checked = st !== "open";
          return (
            <li
              key={action.actionId}
              className="rounded-md border border-[#1E2A40] bg-[#0B1220] p-2"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-[12px] text-[#8B9BB8]">
                  {checked ? "☑" : "☐"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-[#FF4D2E]">{action.priority}</span>
                    <span className="text-[12px] font-medium">{action.label}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#8B9BB8]">{action.detail}</p>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={!unlocked || checked}
                  onClick={() => setState((s) => ({ ...s, [action.actionId]: "acked" }))}
                  className={`flex flex-1 items-center justify-center gap-1 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
                    !unlocked
                      ? "cursor-not-allowed border-[#1E2A40] text-[#8B9BB8] opacity-70"
                      : st === "acked" || st === "assigned"
                        ? "border-[#3DDC97]/40 text-[#3DDC97]"
                        : "border-[#FF4D2E]/50 text-[#FF4D2E] hover:bg-[#FF4D2E]/10"
                  }`}
                >
                  {!unlocked ? (
                    <>
                      <LockIcon /> Ack locked
                    </>
                  ) : st === "acked" || st === "assigned" ? (
                    "Acked"
                  ) : (
                    "Ack"
                  )}
                </button>
                <button
                  type="button"
                  disabled={!unlocked || st === "assigned"}
                  onClick={() => setState((s) => ({ ...s, [action.actionId]: "assigned" }))}
                  className={`flex flex-1 items-center justify-center gap-1 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
                    !unlocked
                      ? "cursor-not-allowed border-[#1E2A40] text-[#8B9BB8] opacity-70"
                      : st === "assigned"
                        ? "border-[#3DDC97]/40 text-[#3DDC97]"
                        : "border-[#1E2A40] text-[#E8EEF9] hover:border-[#3DB9FF]/50"
                  }`}
                >
                  {!unlocked ? (
                    <>
                      <LockIcon /> Assign locked
                    </>
                  ) : st === "assigned" ? (
                    "Assigned"
                  ) : (
                    "Assign"
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
