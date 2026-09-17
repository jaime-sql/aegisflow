import { fetchFirmsHotspots } from "@/lib/ingest/firms";
import type { FirmsFetchDeps } from "@/lib/ingest/firms";
import { fetchWindTicks } from "@/lib/ingest/wind";
import type { WindFetchDeps } from "@/lib/ingest/wind";
import { runAllAgents } from "@/lib/agents";
import type { AgentRuntimeDeps } from "@/lib/agents";
import { cloneFixtureIncident } from "@/lib/fixtures/aegisfire-01";
import { resolveOpsRegion } from "@/lib/regions";
import type { FeedHealth, IncidentEvent } from "@/lib/schema";
import { SCHEMA_VERSION } from "@/lib/schema";
import { SAMPLE_CROWD_REPORT, PUBLIC_CROWD_COPY, scrubPii } from "@/lib/pii";

function rollup(
  incident: IncidentEvent,
  feeds: FeedHealth["feeds"],
): FeedHealth {
  const rank = { ok: 0, degraded: 1, down: 2 } as const;
  const overall = feeds.reduce<FeedHealth["overall"]>((acc, f) => {
    return rank[f.status] > rank[acc] ? f.status : acc;
  }, "ok");
  return {
    eventId: incident.feedHealth.eventId,
    schemaVersion: SCHEMA_VERSION,
    overall,
    feeds,
    producedAt: new Date().toISOString(),
  };
}

export type LoadOpsIncidentDeps = {
  firms?: FirmsFetchDeps;
  wind?: WindFetchDeps;
  agents?: AgentRuntimeDeps;
};

/**
 * Fuse FIRMS + WeatherNext for the selected Ops region.
 * Default region is El Salvador / WUI; pass `cascade` for AegisFire-01.
 */
export async function loadOpsIncident(
  regionId?: string | null,
  deps: LoadOpsIncidentDeps = {},
): Promise<IncidentEvent> {
  const region = resolveOpsRegion(regionId);
  const base = cloneFixtureIncident();
  const crowd = scrubPii(SAMPLE_CROWD_REPORT);
  const ingestRegion = {
    id: region.id,
    bbox: region.bbox,
    center: region.center,
  };

  const [firms, wind] = await Promise.all([
    fetchFirmsHotspots(region.bbox, deps.firms),
    fetchWindTicks(ingestRegion, deps.wind),
  ]);

  const agents = await runAllAgents(
    {
      incidentId: region.incidentId,
      incidentEventId: region.incidentEventId,
      regionName: region.name,
      hotspots: firms.hotspots,
      wind: wind.wind,
    },
    deps.agents,
  );

  const crowdHealth = base.feedHealth.feeds.find((f) => f.id === "crowd") ?? {
    id: "crowd" as const,
    label: "Crowdsource",
    status: "ok" as const,
    detail: `${crowd.redactions} PII field(s) scrubbed`,
    lastSuccessAt: new Date().toISOString(),
  };

  const rfHealth = base.feedHealth.feeds.find((f) => f.id === "rf_sim")!;

  const incident: IncidentEvent = {
    ...base,
    eventId: region.incidentEventId,
    incidentId: region.incidentId,
    name: region.incidentName,
    region: {
      id: region.id,
      name: region.name,
      placeholder: region.placeholder,
      center: region.center,
      bbox: region.bbox,
    },
    executiveSummary: region.executiveSummary,
    hotspots: firms.hotspots,
    wind: wind.wind,
    agents: agents.agents.length ? agents.agents : base.agents,
    feedHealth: rollup(base, [
      firms.health,
      wind.health,
      agents.health,
      { ...crowdHealth, detail: `${PUBLIC_CROWD_COPY} · ${crowd.redactions} fields redacted` },
      rfHealth,
    ]),
    timeline: base.timeline.map((item) => {
      if (item.kind !== "agent") return item;
      const resource = agents.agents.find((a) => a.agentId === "resource-allocation");
      return {
        ...item,
        at: resource?.producedAt ?? item.at,
        sourceEventId: resource?.eventId ?? item.sourceEventId,
        detail: agents.health.detail,
      };
    }),
    updatedAt: new Date().toISOString(),
  };

  return incident;
}
