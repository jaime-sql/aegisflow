"use client";

import dynamic from "next/dynamic";
import type { IncidentEvent } from "@/lib/schema";
import type { OpsSession } from "@/lib/auth/session";
import { TopBar } from "./TopBar";
import { RightRail } from "./RightRail";

const OpsMap = dynamic(() => import("./OpsMap").then((m) => m.OpsMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#07090d] font-mono text-xs text-[#8b98a8]">
      Loading geospatial layer…
    </div>
  ),
});

export function OpsShell({
  incident,
  session,
}: {
  incident: IncidentEvent;
  session: OpsSession;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#07090d]">
      {session.bypass && (
        <div className="flex shrink-0 items-center justify-center gap-3 bg-[#ff6b2c] px-3 py-1 text-center text-[11px] font-semibold text-black">
          <span>DEV BYPASS · NON-PROD</span>
          <span className="font-normal">
            Clerk keys missing — role={session.role}. Add keys in .env.local for real auth.
            Viewer smoke: <code className="font-mono">/?role=viewer</code>
          </span>
        </div>
      )}
      <TopBar incident={incident} session={session} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.85fr)_minmax(320px,0.85fr)]">
        <main className="relative min-h-[45vh]">
          <OpsMap incident={incident} />
        </main>
        <RightRail incident={incident} role={session.role} />
      </div>
    </div>
  );
}
