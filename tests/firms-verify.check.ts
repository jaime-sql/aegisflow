import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  probeFirms,
  verifyFirmsForRegion,
} from "../src/lib/ingest/firms";
import { loadOpsIncident } from "../src/lib/incident/load";
import { EL_SALVADOR_BBOX, CASCADE_BBOX } from "../src/lib/regions";
import { isFirmsDemoFixture } from "../src/lib/ui/firms-demo";
import type { IngestFetch } from "../src/lib/ingest/types";

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

function firmsCsv(count: number): string {
  const header =
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight";
  const rows = Array.from({ length: count }, (_, i) => {
    const lat = (13.2 + i * 0.04).toFixed(4);
    const lon = (-89.8 + i * 0.05).toFixed(4);
    return `${lat},${lon},350.0,0.4,0.4,2026-09-16,1854,N,n,2.0NRT,305.0,20.0,D`;
  });
  return [header, ...rows].join("\n");
}

const ZERO_CSV = `latitude,longitude,bright_ti4,acq_date,acq_time,confidence,frp
`;

function assertNoMapDots(payload: object) {
  const json = JSON.stringify(payload);
  assert.equal("hotspots" in payload, false);
  assert.doesNotMatch(json, /"lat":/);
  assert.doesNotMatch(json, /"lon":/);
  assert.doesNotMatch(json, /NASA_FIRMS/);
}

async function probeTwelveRowsLive() {
  const urls: string[] = [];
  const doFetch: IngestFetch = async (input) => {
    urls.push(String(input));
    return textResponse(firmsCsv(12));
  };
  const result = await verifyFirmsForRegion("el-salvador", {
    env: { FIRMS_MAP_KEY: "test-map-key" },
    fetch: doFetch,
  });
  assert.equal(result.live, true);
  assert.equal(result.rowCount, 36, "12 rows × 3 default NRT products");
  assert.equal(result.summary, "36 rows · LIVE");
  assert.equal(result.error, null);
  assert.equal(result.regionId, "el-salvador");
  assert.deepEqual(result.bbox, EL_SALVADOR_BBOX);
  assert.equal(urls.length, 3);
  assert.ok(urls.every((u) => /firms\.modaps\.eosdis\.nasa\.gov/.test(u)));
  assert.ok(urls.every((u) => /-90\.2,13\.1,-87\.65,14\.48/.test(u)));
  assertNoMapDots(result);
}

async function probeZeroRowsStillLiveNotPainted() {
  const doFetch: IngestFetch = async () => textResponse(ZERO_CSV);
  const probe = await probeFirms(EL_SALVADOR_BBOX, {
    env: { FIRMS_MAP_KEY: "test-map-key" },
    fetch: doFetch,
  });
  assert.equal(probe.live, true);
  assert.equal(probe.rowCount, 0);
  assert.equal(probe.summary, "0 rows · LIVE");
  assertNoMapDots(probe);

  const incident = await loadOpsIncident("el-salvador", {
    firms: { env: { FIRMS_MAP_KEY: "test-map-key" }, fetch: doFetch },
    agents: { env: {} },
  });
  assert.equal(incident.hotspots.length, 0);
  assert.equal(isFirmsDemoFixture(incident), false);
}

async function probeUsesActiveRegionBbox() {
  const urls: string[] = [];
  const doFetch: IngestFetch = async (input) => {
    urls.push(String(input));
    return textResponse(firmsCsv(1));
  };
  const cascade = await verifyFirmsForRegion("cascade", {
    env: { FIRMS_MAP_KEY: "test-map-key" },
    fetch: doFetch,
  });
  assert.equal(cascade.regionId, "cascade");
  assert.deepEqual(cascade.bbox, CASCADE_BBOX);
  assert.equal(cascade.summary, "3 rows · LIVE");
  assert.equal(urls.length, 3);
  assert.ok(urls.every((u) => /-121\.92,44\.12,-121\.28,44\.52/.test(u)));
}

async function probeErrorsAreClear() {
  const missing = await probeFirms(EL_SALVADOR_BBOX, { env: {} });
  assert.equal(missing.live, false);
  assert.equal(missing.summary, "no FIRMS_MAP_KEY");
  assert.equal(missing.error, "no FIRMS_MAP_KEY");
  assertNoMapDots(missing);

  const denied = await probeFirms(EL_SALVADOR_BBOX, {
    env: { FIRMS_MAP_KEY: "test-map-key" },
    fetch: async () => textResponse("denied", 403),
  });
  assert.equal(denied.live, false);
  assert.equal(denied.summary, "FIRMS HTTP 403");
  assert.match(denied.error ?? "", /FIRMS HTTP 403/);

  const forced = await probeFirms(EL_SALVADOR_BBOX, {
    env: { FIRMS_MAP_KEY: "test-map-key", AEGISFLOW_FAIL_FIRMS: "true" },
  });
  assert.equal(forced.live, false);
  assert.match(forced.summary, /forced FIRMS adapter failure/);
  assert.doesNotMatch(forced.summary, /fixture/i);
}

function uiWiring() {
  const top = readFileSync("src/components/ops/TopBar.tsx", "utf8");
  assert.match(top, /FirmsVerifyButton/);
  assert.match(top, /id === "firms"/);
  assert.match(top, /PRIMARY_FEEDS/);

  const button = readFileSync("src/components/ops/FirmsVerifyButton.tsx", "utf8");
  assert.match(button, /"Verify"/);
  assert.match(button, /\/api\/ops\/firms-verify\?region=/);
  assert.match(button, /absoluteAppUrl/);
  assert.match(button, /aria-label="Verify FIRMS"/);
  assert.match(button, /role="status"/);
  assert.doesNotMatch(button, /setIncident/);
  assert.doesNotMatch(button, /hotspots/);

  const route = readFileSync("src/app/api/ops/firms-verify/route.ts", "utf8");
  assert.match(route, /verifyFirmsForRegion/);
  assert.doesNotMatch(route, /loadOpsIncident/);
  assert.doesNotMatch(route, /hotspots/);

  const map = readFileSync("src/components/ops/OpsMap.tsx", "utf8");
  assert.doesNotMatch(map, /firms-verify/);
  assert.doesNotMatch(map, /probeFirms/);
  assert.match(map, /isFirmsDemoFixture\(incident\)/);
  assert.match(map, /firms-wms/);

  const shell = readFileSync("src/components/ops/OpsShell.tsx", "utf8");
  assert.doesNotMatch(shell, /firms-verify/);
  assert.doesNotMatch(shell, /onRegionChange/);
  assert.match(shell, /ingest-refresh/);
}

async function main() {
  await probeTwelveRowsLive();
  await probeZeroRowsStillLiveNotPainted();
  await probeUsesActiveRegionBbox();
  await probeErrorsAreClear();
  uiWiring();
  console.log("OK  Verify FIRMS probe (no map dots; quiet live stays empty)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
