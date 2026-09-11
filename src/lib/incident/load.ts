import { fetchFirmsHotspots } from "@/lib/ingest/firms";
import { fetchWindTicks } from "@/lib/ingest/wind";
import { runAllAgents } from "@/lib/agents";
import { cloneFixtureIncident } from "@/lib/fixtures/aegisfire-01";
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

export async function loadOpsIncident(): Promise<IncidentEvent> {
  const base = cloneFixtureIncident();
  const crowd = scrubPii(SAMPLE_CROWD_REPORT);

  const [firms, wind] = await Promise.all([
    fetchFirmsHotspots(base.region.bbox),
    fetchWindTicks(base.region.center),
  ]);

  const agents = await runAllAgents({
    incidentId: base.incidentId,
    hotspots: firms.hotspots,
    wind: wind.wind,
  });

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
    hotspots: firms.hotspots,
    wind: wind.wind,
    agents: agents.agents.length ? agents.agents : base.agents,
    executiveSummary: base.executiveSummary,
    feedHealth: rollup(base, [
      firms.health,
      wind.health,
      agents.health,
      { ...crowdHealth, detail: `${PUBLIC_CROWD_COPY} · ${crowd.redactions} fields redacted` },
      rfHealth,
    ]),
    updatedAt: new Date().toISOString(),
  };

  return incident;
}
