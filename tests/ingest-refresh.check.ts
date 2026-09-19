import assert from "node:assert/strict";
import { loadIngestRefresh } from "../src/lib/incident/refresh-ingest";
import { applyIngestRefresh } from "../src/lib/ui/ingest-refresh";
import { cloneFixtureIncident } from "../src/lib/fixtures/aegisfire-01";
import { parseIncidentEvent } from "../src/lib/schema/zod";
import type { IngestFetch } from "../src/lib/ingest/types";

const LIVE_CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
44.3042,-121.6418,367.4,0.4,0.4,2026-09-16,1854,N,h,2.0NRT,310.1,48.2,D
`;

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

async function refreshKeepsAgents() {
  const doFetch: IngestFetch = async () => textResponse(LIVE_CSV);
  const refresh = await loadIngestRefresh("cascade", {
    firms: { env: { FIRMS_MAP_KEY: "test-map-key" }, fetch: doFetch },
    wind: { env: {} },
  });
  assert.equal(refresh.regionId, "cascade");
  assert.ok(refresh.hotspots.length >= 1);
  assert.equal(refresh.hotspots[0]?.source, "NASA_FIRMS");
  assert.equal(refresh.firmsHealth.id, "firms");
  assert.equal(refresh.windHealth.id, "wind");

  const base = cloneFixtureIncident();
  base.region.id = "cascade";
  const agentId = base.agents[0]?.eventId;
  assert.ok(agentId);

  const merged = applyIngestRefresh(base, refresh);
  parseIncidentEvent(merged);
  assert.equal(merged.agents[0]?.eventId, agentId, "poll must not replace agents");
  assert.equal(merged.hotspots[0]?.source, "NASA_FIRMS");
  assert.equal(merged.region.id, "cascade");
}

async function refreshIgnoresOtherRegion() {
  const base = cloneFixtureIncident();
  base.region.id = "el-salvador";
  const before = base.hotspots[0]?.eventId;
  const merged = applyIngestRefresh(base, {
    regionId: "cascade",
    hotspots: [],
    wind: [],
    firmsHealth: {
      id: "firms",
      label: "NASA FIRMS",
      status: "ok",
      detail: "Live · 0 detections (quiet bbox)",
      lastSuccessAt: new Date().toISOString(),
    },
    windHealth: {
      id: "wind",
      label: "WeatherNext",
      status: "ok",
      detail: "fixture",
      lastSuccessAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });
  assert.equal(merged.hotspots[0]?.eventId, before);
}

async function main() {
  await refreshKeepsAgents();
  await refreshIgnoresOtherRegion();
  console.log("OK  ingest-refresh merge (agents preserved)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
