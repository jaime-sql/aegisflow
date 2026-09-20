import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cloneFixtureIncident } from "../src/lib/fixtures/aegisfire-01";
import { loadOpsIncident } from "../src/lib/incident/load";
import { parseIncidentEvent } from "../src/lib/schema/zod";
import type { Hotspot, IncidentEvent, WindTick } from "../src/lib/schema";
import {
  FIRMS_DEMO_STATUS,
  FIRMS_LIVE_LABEL,
  feedAgeLine,
  feedAgeParts,
  firmsHonesty,
  formatRelativeAge,
  windHonesty,
} from "../src/lib/ui/feed-age";
import { FIRMS_DEMO_CHIP_LABEL, isFirmsDemoFixture } from "../src/lib/ui/firms-demo";
import {
  MAP_LAYER_KEYS,
  MAP_LAYER_LABELS,
  agentMapAnchor,
  mapLayerCounts,
} from "../src/lib/ui/map-layers";
import { canDispatch, canSpeakBrief } from "../src/lib/auth/roles";
import type { IngestFetch } from "../src/lib/ingest/types";

const LIVE_CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
44.3042,-121.6418,367.4,0.4,0.4,2026-09-16,1854,N,h,2.0NRT,310.1,48.2,D
44.3111,-121.6284,354.1,0.4,0.4,2026-09-16,1854,N,n,2.0NRT,305.0,31.6,D
`;

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

function sampleHotspot(source: Hotspot["source"]): Hotspot {
  return {
    eventId: "evt_aegisfire01_hotspot_01",
    schemaVersion: "1.0.0",
    lat: 44.3042,
    lon: -121.6418,
    brightnessK: 367.4,
    confidence: "high",
    observedAt: "2026-09-16T18:54:00.000Z",
    source,
  };
}

function sampleWind(source: WindTick["source"]): WindTick {
  return {
    eventId: "evt_aegisfire01_wind_01",
    schemaVersion: "1.0.0",
    lat: 44.31,
    lon: -121.64,
    speedMps: 12.4,
    directionDeg: 242,
    observedAt: "2026-09-16T19:00:00.000Z",
    source,
  };
}

function withFeeds(
  incident: IncidentEvent,
  patch: {
    hotspots?: Hotspot[];
    wind?: WindTick[];
    firmsDetail?: string;
    firmsStatus?: IncidentEvent["feedHealth"]["feeds"][number]["status"];
    windStatus?: IncidentEvent["feedHealth"]["feeds"][number]["status"];
    lastSuccessAt?: string | null;
  },
): IncidentEvent {
  const feeds = incident.feedHealth.feeds.map((f) => {
    if (f.id === "firms" && (patch.firmsDetail || patch.firmsStatus || patch.lastSuccessAt !== undefined)) {
      return {
        ...f,
        detail: patch.firmsDetail ?? f.detail,
        status: patch.firmsStatus ?? f.status,
        lastSuccessAt:
          patch.lastSuccessAt !== undefined ? patch.lastSuccessAt : f.lastSuccessAt,
      };
    }
    if (f.id === "wind" && patch.windStatus) {
      return { ...f, status: patch.windStatus };
    }
    return f;
  });
  return {
    ...incident,
    hotspots: patch.hotspots ?? incident.hotspots,
    wind: patch.wind ?? incident.wind,
    feedHealth: { ...incident.feedHealth, feeds },
  };
}

function relativeAgeFormatting() {
  const now = Date.parse("2026-09-20T19:00:00.000Z");
  assert.equal(formatRelativeAge("2026-09-20T18:59:50.000Z", now), "just now");
  assert.equal(formatRelativeAge("2026-09-20T18:59:20.000Z", now), "40s ago");
  assert.equal(formatRelativeAge("2026-09-20T18:56:00.000Z", now), "4m ago");
  assert.equal(formatRelativeAge("2026-09-20T15:00:00.000Z", now), "4h ago");
  assert.equal(formatRelativeAge("2026-09-10T19:00:00.000Z", now), "10d ago");
  assert.equal(formatRelativeAge(null, now), null);
}

function fixtureNeverClaimsLive() {
  const fixture = cloneFixtureIncident();
  const now = Date.parse("2026-09-20T19:12:00.000Z");
  const line = feedAgeLine(fixture, now);
  const parts = feedAgeParts(fixture, now);

  assert.equal(isFirmsDemoFixture(fixture), true);
  assert.equal(firmsHonesty(fixture), FIRMS_DEMO_STATUS);
  assert.equal(windHonesty(fixture), "fallback");
  assert.equal(parts.firmsHonesty, "DEMO FIXTURE");
  assert.equal(parts.windHonesty, "fallback");
  assert.match(line, /FIRMS · \d+d ago · DEMO FIXTURE/);
  assert.match(line, /Wind · fallback/);
  assert.doesNotMatch(line, /FIRMS · .+ · LIVE/);
  assert.doesNotMatch(line, /Wind · LIVE/);
  assert.equal(FIRMS_DEMO_CHIP_LABEL, "Hotspots · DEMO FIXTURE");
}

function liveFirmsAndWeatherNextAreLive() {
  const base = cloneFixtureIncident();
  const live = withFeeds(base, {
    hotspots: [sampleHotspot("NASA_FIRMS")],
    wind: [sampleWind("WEATHERNEXT")],
    firmsDetail: "Live VIIRS_SNPP_NRT · 1 detections",
    firmsStatus: "ok",
    windStatus: "ok",
    lastSuccessAt: "2026-09-20T18:56:00.000Z",
  });
  const now = Date.parse("2026-09-20T19:00:00.000Z");
  const line = feedAgeLine(live, now);
  assert.equal(isFirmsDemoFixture(live), false);
  assert.equal(firmsHonesty(live), FIRMS_LIVE_LABEL);
  assert.equal(windHonesty(live), "LIVE");
  assert.equal(feedAgeParts(live, now).firmsAge, "4m ago");
  assert.match(line, /FIRMS · 4m ago · LIVE/);
  assert.match(line, /Wind · LIVE/);
  assert.doesNotMatch(line, /DEMO FIXTURE/);
  assert.doesNotMatch(line, /Wind · fallback/);
}

function liveFirmsWithWindFallback() {
  const live = withFeeds(cloneFixtureIncident(), {
    hotspots: [sampleHotspot("NASA_FIRMS")],
    wind: [sampleWind("MOCK_WIND")],
    firmsDetail: "Live VIIRS_SNPP_NRT · 1 detections",
    firmsStatus: "ok",
    windStatus: "ok",
    lastSuccessAt: "2026-09-20T18:56:00.000Z",
  });
  const now = Date.parse("2026-09-20T19:00:00.000Z");
  const line = feedAgeLine(live, now);
  assert.equal(firmsHonesty(live), "LIVE");
  assert.equal(windHonesty(live), "fallback");
  assert.match(line, /FIRMS · 4m ago · LIVE/);
  assert.match(line, /Wind · fallback/);
  assert.doesNotMatch(line, /Wind · LIVE/);
}

function windOfflineNeverLive() {
  const down = withFeeds(cloneFixtureIncident(), {
    wind: [],
    windStatus: "down",
  });
  const line = feedAgeLine(down, Date.parse("2026-09-20T19:00:00.000Z"));
  assert.equal(windHonesty(down), "offline");
  assert.match(line, /Wind · offline/);
  assert.doesNotMatch(line, /Wind · LIVE/);
}

function countsMatchIncidentArrays() {
  const fixture = cloneFixtureIncident();
  const counts = mapLayerCounts(fixture);
  assert.equal(counts.hotspots, fixture.hotspots.length);
  assert.equal(counts.wind, fixture.wind.length);
  assert.equal(counts.agents, fixture.agents.length);
  assert.equal(counts.agents, 3);
  assert.deepEqual([...MAP_LAYER_KEYS], ["hotspots", "wind", "agents"]);
  assert.equal(MAP_LAYER_LABELS.hotspots, "Hotspots");
  assert.equal(MAP_LAYER_LABELS.wind, "Wind");
  assert.equal(MAP_LAYER_LABELS.agents, "Agents");

  const empty = { ...fixture, hotspots: [], wind: [], agents: [] };
  assert.deepEqual(mapLayerCounts(empty), {
    hotspots: 0,
    wind: 0,
    agents: 0,
  });
}

function agentAnchorsUseRealLineage() {
  const fixture = cloneFixtureIncident();
  const seen = new Set<string>();
  for (const agent of fixture.agents) {
    const anchor = agentMapAnchor(agent, fixture);
    assert.ok(Number.isFinite(anchor.lat) && Number.isFinite(anchor.lon));
    const mapped = [
      ...fixture.hotspots.map((h) => ({ lat: h.lat, lon: h.lon, eventId: h.eventId })),
      ...fixture.wind.map((w) => ({ lat: w.lat, lon: w.lon, eventId: w.eventId })),
    ].filter((p) => p.lat === anchor.lat && p.lon === anchor.lon);
    assert.ok(
      mapped.length > 0,
      `${agent.agentId} must sit on a real hotspot/wind already on the map`,
    );
    const key = `${anchor.lat},${anchor.lon}`;
    assert.equal(seen.has(key), false, `${agent.agentId} must not stack on another agent`);
    seen.add(key);
  }
}

async function ingestCountsMatchLoad() {
  const incident = await loadOpsIncident("el-salvador", {
    firms: { env: {} },
    wind: { env: {}, kv: null },
    agents: { env: {} },
  });
  parseIncidentEvent(incident);
  const counts = mapLayerCounts(incident);
  assert.equal(counts.hotspots, incident.hotspots.length);
  assert.equal(counts.wind, incident.wind.length);
  assert.equal(counts.agents, incident.agents.length);
  assert.equal(firmsHonesty(incident), "DEMO FIXTURE");
  assert.equal(windHonesty(incident), "fallback");
  assert.doesNotMatch(feedAgeLine(incident), /Wind · LIVE/);
  assert.doesNotMatch(feedAgeLine(incident), /FIRMS · .+ · LIVE/);

  const doFetch: IngestFetch = async () => textResponse(LIVE_CSV);
  const liveFirms = await loadOpsIncident("cascade", {
    firms: { env: { FIRMS_MAP_KEY: "test-map-key" }, fetch: doFetch },
    wind: { env: {}, kv: null },
    agents: { env: {} },
  });
  assert.equal(isFirmsDemoFixture(liveFirms), false);
  assert.equal(firmsHonesty(liveFirms), "LIVE");
  assert.equal(windHonesty(liveFirms), "fallback");
  assert.equal(mapLayerCounts(liveFirms).hotspots, liveFirms.hotspots.length);
  const line = feedAgeLine(liveFirms, Date.now());
  assert.match(line, /FIRMS · .+ · LIVE/);
  assert.match(line, /Wind · fallback/);
}

function rolesUnchanged() {
  assert.equal(canDispatch("manager"), true);
  assert.equal(canDispatch("viewer"), false);
  assert.equal(canSpeakBrief("manager"), true);
  assert.equal(canSpeakBrief("viewer"), false);

  const dispatch = readFileSync("src/components/ops/DispatchList.tsx", "utf8");
  assert.match(dispatch, /canDispatch\(role\)/);
  assert.match(dispatch, /Ack locked/);
  assert.match(dispatch, /Assign locked/);
  const exec = readFileSync("src/components/ops/ExecSummaryCard.tsx", "utf8");
  assert.match(exec, /canSpeakBrief\(role\)/);
  const rail = readFileSync("src/components/ops/RightRail.tsx", "utf8");
  assert.doesNotMatch(rail, /MapLegendStack/);
  assert.doesNotMatch(rail, /onToggle/);
  assert.doesNotMatch(rail, /Hotspots/);
  for (const file of [
    "RightRail",
    "TopBar",
    "OpsShell",
    "ExecSummaryCard",
    "DispatchList",
    "FeedBanner",
  ] as const) {
    const src = readFileSync(`src/components/ops/${file}.tsx`, "utf8");
    assert.doesNotMatch(src, /dossier/i);
    assert.doesNotMatch(src, /judge-path|judge path/i);
  }
}

function uiWiring() {
  const stack = readFileSync("src/components/ops/MapLegendStack.tsx", "utf8");
  assert.match(stack, /Hotspots/);
  assert.match(stack, /Wind/);
  assert.match(stack, /Agents/);
  assert.match(stack, /feedAgeParts/);
  assert.match(stack, /DemoFixtureChip/);
  assert.match(stack, /ExperimentalBadge/);
  assert.doesNotMatch(stack, /SimBadge/);

  const map = readFileSync("src/components/ops/OpsMap.tsx", "utf8");
  assert.match(map, /drawHotspots/);
  assert.match(map, /drawWind/);
  assert.match(map, /drawAgents/);
  assert.match(map, /applyLayerVisibility/);
  assert.match(map, /map\.hasLayer/);
  assert.match(map, /map\.removeLayer/);
  assert.match(map, /onToggle/);
  assert.doesNotMatch(map, /drawOsint|drawCctv|drawFlights/);

  const top = readFileSync("src/components/ops/TopBar.tsx", "utf8");
  assert.match(top, /SimBadge label="RF"/);
  assert.match(top, /windChipDisplay/);
  assert.doesNotMatch(top, /onToggle/);

  const shell = readFileSync("src/components/ops/OpsShell.tsx", "utf8");
  assert.match(shell, /65%/);
  assert.match(shell, /FeedBanner/);
}

async function main() {
  relativeAgeFormatting();
  fixtureNeverClaimsLive();
  liveFirmsAndWeatherNextAreLive();
  liveFirmsWithWindFallback();
  windOfflineNeverLive();
  countsMatchIncidentArrays();
  agentAnchorsUseRealLineage();
  await ingestCountsMatchLoad();
  rolesUnchanged();
  uiWiring();
  console.log("OK  map legend toggles + honest feed age");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
