"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { IncidentEvent } from "@/lib/schema";
import { parseIncidentEvent } from "@/lib/schema";
import type { OpsSession } from "@/lib/auth/session";
import type { RegionId } from "@/lib/regions";
import { isFeedUnhealthy } from "@/lib/ui/status";
import {
  opsIncidentUrl,
  opsRegionHref,
  withBasePath,
} from "@/lib/base-path";
import { TopBar } from "./TopBar";
import { RightRail } from "./RightRail";
import { LineageDrawer } from "./LineageDrawer";
import { FeedBanner } from "./FeedBanner";

const OpsMap = dynamic(() => import("./OpsMap").then((m) => m.OpsMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#0B1220] font-mono text-xs text-[#8B9BB8]">
      Loading geospatial layer…
    </div>
  ),
});

function rememberRegionInUrl(regionId: RegionId) {
  if (typeof window === "undefined") return;
  const next = opsRegionHref(regionId, window.location.href);
  window.history.replaceState(null, "", next);
}

function hardNavigateToRegion(regionId: RegionId) {
  if (typeof window === "undefined") return;
  window.location.assign(opsRegionHref(regionId, window.location.href));
}

export function OpsShell({
  incident: initialIncident,
  session,
}: {
  incident: IncidentEvent;
  session: OpsSession;
}) {
  const [incident, setIncident] = useState(initialIncident);
  const [switching, setSwitching] = useState(false);
  const [lineageId, setLineageId] = useState<string | null>(null);
  const selected = useMemo(
    () => incident.agents.find((a) => a.eventId === lineageId) ?? null,
    [incident.agents, lineageId],
  );

  async function onRegionChange(regionId: RegionId) {
    if (regionId === incident.region.id || switching) return;
    setSwitching(true);
    try {
      const res = await fetch(opsIncidentUrl(regionId), {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("json")) {
        throw new Error(`incident HTTP ${res.status}`);
      }
      const next = parseIncidentEvent(await res.json());
      setIncident(next);
      rememberRegionInUrl(regionId);
    } catch {
      // Fetch under a missing basePath 404s on the Worker; hard-navigate so
      // the RSC page reloads ?region= under /aegisflow instead of staying put.
      hardNavigateToRegion(regionId);
    } finally {
      setSwitching(false);
    }
  }

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
      <TopBar
        incident={incident}
        session={session}
        switching={switching}
        onRegionChange={onRegionChange}
      />
      <div className="relative grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,65%)_minmax(340px,35%)]">
        <main className="relative min-h-[45vh]">
          <OpsMap incident={incident} />
          {isFeedUnhealthy(incident.feedHealth) && (
            <FeedBanner health={incident.feedHealth} />
          )}
        </main>
        <RightRail
          incident={incident}
          role={session.role}
          selectedAgentId={lineageId}
          onSelectAgent={(agent) => setLineageId(agent.eventId)}
          onViewLineage={() =>
            setLineageId(incident.agents[0]?.eventId ?? null)
          }
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
