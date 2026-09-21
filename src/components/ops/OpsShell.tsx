"use client";

import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { IncidentEvent } from "@/lib/schema";
import type { OpsSession } from "@/lib/auth/session";
import { isFeedUnhealthy } from "@/lib/ui/status";
import { withBasePath } from "@/lib/base-path";
import { clearOpsWalkthroughDismissal } from "@/lib/ui/ops-walkthrough";
import { TopBar } from "./TopBar";
import { RightRail } from "./RightRail";
import { LineageDrawer } from "./LineageDrawer";
import { FeedBanner } from "./FeedBanner";
import { OpsWalkthrough } from "./OpsWalkthrough";
import { AskOpsDrawer } from "./AskOpsDrawer";

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
}: {
  incident: IncidentEvent;
  session: OpsSession;
  regionPicker: ReactNode;
  ttsConfigured: boolean;
}) {
  const [lineageId, setLineageId] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [walkthroughKey, setWalkthroughKey] = useState(0);
  const replayOpsWalkthrough = useCallback(() => {
    // Stay on the current URL (including /aegisflow). No fetch, no navigation.
    clearOpsWalkthroughDismissal();
    setWalkthroughKey((key) => key + 1);
  }, []);
  const selected = useMemo(
    () => incident.agents.find((a) => a.eventId === lineageId) ?? null,
    [incident.agents, lineageId],
  );

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
        regionPicker={regionPicker}
        onReplayTour={replayOpsWalkthrough}
        onOpenAsk={() => setAskOpen(true)}
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
          ttsConfigured={ttsConfigured}
        />
        {selected && (
          <LineageDrawer
            agent={selected}
            role={session.role}
            onClose={() => setLineageId(null)}
          />
        )}
        <AskOpsDrawer
          open={askOpen}
          incident={incident}
          configured={ttsConfigured}
          onClose={() => setAskOpen(false)}
        />
      </div>
      <OpsWalkthrough key={walkthroughKey} role={session.role} />
    </div>
  );
}
