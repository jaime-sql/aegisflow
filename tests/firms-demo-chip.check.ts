import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchFirmsHotspots } from "../src/lib/ingest/firms";
import { loadOpsIncident } from "../src/lib/incident/load";
import { cloneFixtureIncident } from "../src/lib/fixtures/aegisfire-01";
import { parseIncidentEvent } from "../src/lib/schema/zod";
import { isFeedUnhealthy } from "../src/lib/ui/status";
import {
  FIRMS_DEMO_CHIP_LABEL,
  FIRMS_DEMO_POPUP_LINE,
  FIRMS_QUIET_CHIP_LABEL,
  hotspotPopupHtml,
  isFirmsDemoFixture,
  isFirmsQuietLive,
} from "../src/lib/ui/firms-demo";
import type { Hotspot, IncidentEvent } from "../src/lib/schema";
import type { IngestFetch } from "../src/lib/ingest/types";

const LIVE_CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
44.3042,-121.6418,367.4,0.4,0.4,2026-09-16,1854,N,h,2.0NRT,310.1,48.2,D
44.3111,-121.6284,354.1,0.4,0.4,2026-09-16,1854,N,n,2.0NRT,305.0,31.6,D
`;

const ZERO_CSV = `latitude,longitude,bright_ti4,acq_date,acq_time,confidence,frp
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

function withHotspots(
  incident: IncidentEvent,
  hotspots: Hotspot[],
  firmsDetail: string,
): IncidentEvent {
  const feeds = incident.feedHealth.feeds.map((f) =>
    f.id === "firms" ? { ...f, detail: firmsDetail } : f,
  );
  return { ...incident, hotspots, feedHealth: { ...incident.feedHealth, feeds } };
}

function helperShowHide() {
  const base = cloneFixtureIncident();
  const fixture = withHotspots(
    base,
    [sampleHotspot("NASA_FIRMS_FIXTURE")],
    "Fixture VIIRS hotspots (no FIRMS_MAP_KEY)",
  );
  const live = withHotspots(
    base,
    [sampleHotspot("NASA_FIRMS")],
    "Live VIIRS_SNPP_NRT · 1 detections",
  );
  const emptyFixtureDetail = withHotspots(
    base,
    [],
    "Live pull failed (FIRMS HTTP 403) — fixture in use",
  );
  const emptyLiveDetail = withHotspots(
    base,
    [],
    "Live SNPP+NOAA20+NOAA21 · 0 detections (quiet bbox)",
  );

  assert.equal(isFirmsDemoFixture(fixture), true, "fixture source must show chip");
  assert.equal(isFirmsDemoFixture(live), false, "LIVE NASA_FIRMS must hide chip");
  assert.equal(isFirmsDemoFixture(emptyFixtureDetail), true);
  assert.equal(isFirmsDemoFixture(emptyLiveDetail), false);
  assert.equal(isFirmsDemoFixture(cloneFixtureIncident()), true);
}

function popupFirstLine() {
  const fixture = sampleHotspot("NASA_FIRMS_FIXTURE");
  const live = sampleHotspot("NASA_FIRMS");
  const fixtureHtml = hotspotPopupHtml(fixture, true);
  const liveHtml = hotspotPopupHtml(live, false);

  const demoAt = fixtureHtml.indexOf(FIRMS_DEMO_POPUP_LINE);
  const idAt = fixtureHtml.indexOf(fixture.eventId);
  assert.ok(demoAt >= 0, "fixture popup missing demo first line");
  assert.ok(demoAt < idAt, "demo line must be the first popup line");
  assert.doesNotMatch(liveHtml, /Demo fixture/);
  assert.match(liveHtml, new RegExp(live.eventId));
}

function feedBannerUnchanged() {
  const bannerSrc = readFileSync("src/components/ops/FeedBanner.tsx", "utf8");
  assert.match(bannerSrc, /health\.feeds\.filter\(\(f\) => f\.status !== "ok"\)/);
  assert.doesNotMatch(bannerSrc, /DEMO FIXTURE/);
  assert.doesNotMatch(bannerSrc, /isFirmsDemoFixture/);

  const fixture = cloneFixtureIncident();
  assert.equal(isFeedUnhealthy(fixture.feedHealth), false);

  const degraded: IncidentEvent["feedHealth"] = {
    ...fixture.feedHealth,
    overall: "degraded",
    feeds: fixture.feedHealth.feeds.map((f) =>
      f.id === "firms"
        ? {
            ...f,
            status: "degraded",
            detail: "Live pull failed (FIRMS HTTP 403) — fixture in use",
          }
        : f,
    ),
  };
  assert.equal(isFeedUnhealthy(degraded), true);
}

async function ingestFixtureVsLive() {
  const esFixture = await loadOpsIncident("el-salvador", {
    firms: { env: {} },
    agents: { env: {} },
  });
  const cascadeFixture = await loadOpsIncident("cascade", {
    firms: { env: {} },
    agents: { env: {} },
  });
  parseIncidentEvent(esFixture);
  parseIncidentEvent(cascadeFixture);
  assert.equal(isFirmsDemoFixture(esFixture), true);
  assert.equal(isFirmsDemoFixture(cascadeFixture), true);
  assert.equal(esFixture.hotspots[0]?.source, "NASA_FIRMS_FIXTURE");
  assert.equal(cascadeFixture.hotspots[0]?.source, "NASA_FIRMS_FIXTURE");
  assert.notEqual(
    esFixture.hotspots[0]?.lat.toFixed(3),
    cascadeFixture.hotspots[0]?.lat.toFixed(3),
    "remap must keep chip in sync without collapsing regions",
  );

  const doFetch: IngestFetch = async () => textResponse(LIVE_CSV);
  const esLive = await loadOpsIncident("el-salvador", {
    firms: { env: { FIRMS_MAP_KEY: "test-map-key" }, fetch: doFetch },
    agents: { env: {} },
  });
  const cascadeLive = await loadOpsIncident("cascade", {
    firms: { env: { FIRMS_MAP_KEY: "test-map-key" }, fetch: doFetch },
    agents: { env: {} },
  });
  assert.equal(isFirmsDemoFixture(esLive), false);
  assert.equal(isFirmsDemoFixture(cascadeLive), false);
  assert.equal(esLive.hotspots[0]?.source, "NASA_FIRMS");
  assert.equal(cascadeLive.hotspots[0]?.source, "NASA_FIRMS");

  const quietDay = await loadOpsIncident("el-salvador", {
    firms: {
      env: { FIRMS_MAP_KEY: "test-map-key" },
      fetch: async () => textResponse(ZERO_CSV),
    },
    agents: { env: {} },
  });
  assert.equal(isFirmsDemoFixture(quietDay), false);
  assert.equal(isFirmsQuietLive(quietDay), true);
  assert.equal(quietDay.hotspots.length, 0);
  assert.equal(isFeedUnhealthy(quietDay.feedHealth), false);

  const firmsLive = await fetchFirmsHotspots([-90.2, 13.1, -87.65, 14.48], {
    env: { FIRMS_MAP_KEY: "test-map-key" },
    fetch: doFetch,
  });
  assert.equal(firmsLive.usedFixture, false);
  assert.equal(
    isFirmsDemoFixture({
      hotspots: firmsLive.hotspots,
      feedHealth: {
        eventId: "evt_aegisfire01_feed",
        schemaVersion: "1.0.0",
        overall: "ok",
        producedAt: new Date().toISOString(),
        feeds: [firmsLive.health],
      },
    }),
    false,
  );
}

function uiWiring() {
  const map = readFileSync("src/components/ops/OpsMap.tsx", "utf8");
  assert.match(map, /MapLegendStack/);
  assert.match(map, /isFirmsDemoFixture\(incident\)/);
  assert.match(map, /hotspotPopupHtml/);
  assert.match(map, /firmsDemoFixture=\{isFirmsDemoFixture\(incident\)\}/);
  assert.match(map, /role="switch"/);
  assert.match(map, /aria-label="Toggle hotspots"/);
  assert.match(map, /showHotspots/);
  assert.match(map, /setShowHotspots/);

  const stack = readFileSync("src/components/ops/MapLegendStack.tsx", "utf8");
  const weatherAt = stack.indexOf('<ExperimentalBadge label="WeatherNext" />');
  const chipAt = stack.indexOf("<DemoFixtureChip");
  assert.ok(weatherAt >= 0 && chipAt > weatherAt, "chip must sit under WeatherNext Experimental");
  assert.match(stack, /firmsDemoFixture \? <DemoFixtureChip/);
  assert.match(stack, /QuietBboxChip/);
  assert.match(stack, /firmsQuietLive/);
  assert.match(stack, /SimBadge label="RF"/);
  assert.match(stack, /SimBadge label="Edge"/);
  assert.match(map, /isFirmsQuietLive/);
  assert.equal(FIRMS_QUIET_CHIP_LABEL, "Hotspots · 0 LIVE");

  const chip = readFileSync("src/components/ops/DemoFixtureChip.tsx", "utf8");
  assert.match(chip, /FIRMS_DEMO_CHIP_LABEL/);
  assert.match(chip, /border-\[#FFB020\]/);
  assert.match(chip, /bg-\[#0B1220\]/);
  assert.match(chip, /text-\[#FFB020\]/);
  assert.match(chip, /text-\[9px\]/);
  assert.match(chip, /whitespace-nowrap/);
  assert.equal(FIRMS_DEMO_CHIP_LABEL, "Hotspots · DEMO FIXTURE");
  assert.equal(FIRMS_DEMO_POPUP_LINE, "Demo fixture · not live FIRMS");

  const shell = readFileSync("src/components/ops/OpsShell.tsx", "utf8");
  assert.match(shell, /isFeedUnhealthy\(live\.feedHealth\) &&/);
  assert.match(shell, /FeedBanner health=\{live\.feedHealth\}/);
  assert.match(shell, /ingest-refresh/);
  assert.match(shell, /applyIngestRefresh/);
}

async function main() {
  helperShowHide();
  popupFirstLine();
  feedBannerUnchanged();
  await ingestFixtureVsLive();
  uiWiring();
  console.log("OK  FIRMS demo-fixture map chip (show on fixture, hide when LIVE)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
