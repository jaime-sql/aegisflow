import type { FeedComponent, FeedHealth, IncidentEvent } from "@/lib/schema";
import { SCHEMA_VERSION } from "@/lib/schema";
import type { IngestRefreshPayload } from "@/lib/incident/refresh-ingest";

function rollupFeeds(
  eventId: string,
  feeds: FeedComponent[],
): FeedHealth {
  const rank = { ok: 0, degraded: 1, down: 2 } as const;
  const overall = feeds.reduce<FeedHealth["overall"]>((acc, f) => {
    return rank[f.status] > rank[acc] ? f.status : acc;
  }, "ok");
  return {
    eventId,
    schemaVersion: SCHEMA_VERSION,
    overall,
    feeds,
    producedAt: new Date().toISOString(),
  };
}

/** Merge ingest-only poll payload into the SSR incident (keeps agents). */
export function applyIngestRefresh(
  incident: IncidentEvent,
  refresh: IngestRefreshPayload,
): IncidentEvent {
  if (refresh.regionId !== incident.region.id) return incident;

  const feeds = incident.feedHealth.feeds.map((f) => {
    if (f.id === "firms") return refresh.firmsHealth;
    if (f.id === "wind") return refresh.windHealth;
    return f;
  });

  return {
    ...incident,
    hotspots: refresh.hotspots,
    wind: refresh.wind,
    feedHealth: rollupFeeds(incident.feedHealth.eventId, feeds),
    updatedAt: refresh.updatedAt,
  };
}
