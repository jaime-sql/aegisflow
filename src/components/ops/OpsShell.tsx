"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { IncidentEvent } from "@/lib/schema";
import type { OpsSession } from "@/lib/auth/session";
import type { IngestRefreshPayload } from "@/lib/incident/refresh-ingest";
import { isFeedUnhealthy } from "@/lib/ui/status";
import { applyIngestRefresh } from "@/lib/ui/ingest-refresh";
import { withBasePath } from "@/lib/base-path";
import { TopBar } from "./TopBar";
import { RightRail } from "./RightRail";
import { LineageDrawer } from "./LineageDrawer";
import { FeedBanner } from "./FeedBanner";

/** Ingest-only poll interval — keeps FIRMS/wind fresh without re-running agents. */
const INGEST_POLL_MS = 180_000;

const OpsMap = dynamic(() => import("./OpsMap").then((m) => m.OpsMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#0B1220] font-mono text-xs text-[#8B9BB8]">
      Loading geospatial layer…
    </div>
  ),
});

export function OpsShell({
  incident,
  session,
  regionPicker,
  ttsConfigured,
  firmsWmsEnabled = false,
}: {
  incident: IncidentEvent;
  session: OpsSession;
  regionPicker: ReactNode;
  ttsConfigured: boolean;
  firmsWmsEnabled?: boolean;
}) {
  const [live, setLive] = useState(incident);
  const [lineageId, setLineageId] = useState<string | null>(null);
  const selected = useMemo(
    () => live.agents.find((a) => a.eventId === lineageId) ?? null,
    [live.agents, lineageId],
  );

  useEffect(() => {
    setLive(incident);
  }, [incident]);

  useEffect(() => {
    const regionId = live.region.id;
    let cancelled = false;

    async function refreshIngest() {
      try {
        const res = await fetch(
          withBasePath(`/api/ops/ingest-refresh?region=${encodeURIComponent(regionId)}`),
          { cache: "no-store", credentials: "same-origin" },
        );
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as IngestRefreshPayload;
        if (cancelled) return;
        setLive((prev) => applyIngestRefresh(prev, payload));
      } catch {
        // Keep last good SSR/poll snapshot — Ops must not blank on a soft fail.
      }
    }

    const timer = window.setInterval(refreshIngest, INGEST_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [live.region.id]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0B1220] text-[#E8EEF9]">
      {session.bypass && (
        <div className="flex shrink-0 items-center justify-center gap-3 bg-[#FF4D2E] px-3 py-1 text-center text-[11px] font-semibold text-black">
          <span>DEV BYPASS · NON-PROD</span>
          <span className="font-normal">
            Clerk keys missing — role={session.role}. Viewer smoke:{" "}
            <code className="font-mono">{withBasePath("/ops")}?role=viewer</code>
          </span>
        </div>
      )}
      <TopBar incident={live} session={session} regionPicker={regionPicker} />
      <div className="relative grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,65%)_minmax(340px,35%)]">
        <main className="relative min-h-[45vh]">
          <OpsMap incident={live} firmsWmsEnabled={firmsWmsEnabled} />
          {isFeedUnhealthy(live.feedHealth) && (
            <FeedBanner health={live.feedHealth} />
          )}
        </main>
        <RightRail
          incident={live}
          role={session.role}
          selectedAgentId={lineageId}
          onSelectAgent={(agent) => setLineageId(agent.eventId)}
          onViewLineage={() =>
            setLineageId(live.agents[0]?.eventId ?? null)
          }
          ttsConfigured={ttsConfigured}
        />
        {selected && (
          <LineageDrawer
            agent={selected}
            role={session.role}
            onClose={() => setLineageId(null)}
          />
        )}
      </div>
    </div>
  );
}
