import { fetchFirmsHotspots } from "@/lib/ingest/firms";
import type { FirmsFetchDeps } from "@/lib/ingest/firms";
import { fetchWindTicks } from "@/lib/ingest/wind";
import type { WindFetchDeps } from "@/lib/ingest/wind";
import { resolveOpsRegion } from "@/lib/regions";
import type { FeedComponent, Hotspot, WindTick } from "@/lib/schema";

export type IngestRefreshPayload = {
  regionId: string;
  hotspots: Hotspot[];
  wind: WindTick[];
  firmsHealth: FeedComponent;
  windHealth: FeedComponent;
  updatedAt: string;
};

export type LoadIngestRefreshDeps = {
  firms?: FirmsFetchDeps;
  wind?: WindFetchDeps;
};

/**
 * FIRMS + WeatherNext only — used by Ops client polling so we do not re-burn
 * LLM / Modal credits on every refresh tick.
 */
export async function loadIngestRefresh(
  regionId?: string | null,
  deps: LoadIngestRefreshDeps = {},
): Promise<IngestRefreshPayload> {
  const region = resolveOpsRegion(regionId);
  const ingestRegion = {
    id: region.id,
    bbox: region.bbox,
    center: region.center,
  };

  const [firms, wind] = await Promise.all([
    fetchFirmsHotspots(region.bbox, deps.firms),
    fetchWindTicks(ingestRegion, deps.wind),
  ]);

  return {
    regionId: region.id,
    hotspots: firms.hotspots,
    wind: wind.wind,
    firmsHealth: firms.health,
    windHealth: wind.health,
    updatedAt: new Date().toISOString(),
  };
}
