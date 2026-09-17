import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchFirmsHotspots } from "../src/lib/ingest/firms";
import { fetchWindTicks } from "../src/lib/ingest/wind";
import {
  BQ_JOB_TIMEOUT_CODE,
  BQ_MAX_BYTES_BILLED,
  runBigQuerySql,
} from "../src/lib/ingest/bigquery";
import { resetGcpTokenCache, signServiceAccountJwt } from "../src/lib/ingest/gcp-auth";
import type { GcpServiceAccount } from "../src/lib/ingest/gcp-auth";
import {
  WEATHERNEXT_CATALOG,
  WEATHERNEXT_OPS_QUERY,
  bboxPolygonWkt,
  buildWeatherNextWindSql,
  mapWeatherNextRowsToWindTicks,
  parseWeatherNextQueryRows,
  resolveWeatherNextTable,
  windDirectionFromUv,
} from "../src/lib/ingest/weathernext";
import { loadOpsIncident } from "../src/lib/incident/load";
import { EL_SALVADOR_BBOX } from "../src/lib/regions";
import { WindTickSchema, parseIncidentEvent } from "../src/lib/schema/zod";
import { isFeedUnhealthy } from "../src/lib/ui/status";
import {
  WIND_FALLBACK_COLOR,
  WIND_FALLBACK_DETAIL,
  WIND_LIVE_COLOR,
  WIND_OFFLINE_DETAIL,
  isLiveWeatherNextWind,
  publicWindBannerDetail,
  windOverlayColor,
} from "../src/lib/ui/wind-feed";
import type { IngestEnv, IngestFetch } from "../src/lib/ingest/types";

const BBOX = [-121.92, 44.12, -121.28, 44.52] as [number, number, number, number];
const REGION = { bbox: BBOX, center: { lat: 44.321, lon: -121.548 } };

const FIRMS_CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
44.3042,-121.6418,367.4,0.4,0.4,2026-09-16,1854,N,h,2.0NRT,310.1,48.2,D
44.3111,-121.6284,354.1,0.4,0.4,2026-09-16,1854,N,n,2.0NRT,305.0,31.6,D
`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

const ENV_KEYS = [
  "FIRMS_MAP_KEY",
  "FIRMS_PRODUCT",
  "GCP_SA_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  "GCP_PROJECT_ID",
  "WEATHERNEXT_BQ_DATASET",
  "WEATHERNEXT_BQ_TABLE",
  "AEGISFLOW_FAIL_FIRMS",
  "AEGISFLOW_FAIL_WIND",
  "AEGISFLOW_USE_FIRMS_FIXTURE",
  "AEGISFLOW_USE_WEATHERNEXT_FIXTURE",
  "AEGISFLOW_LIVE_WEATHERNEXT",
] as const;

function stashEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function clearLiveEnv(): IngestEnv {
  const env: IngestEnv = {};
  return env;
}

async function pemFromSubtle(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const b64 = Buffer.from(pkcs8).toString("base64");
  const wrapped = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`;
}

async function testServiceAccount(): Promise<GcpServiceAccount> {
  return {
    client_email: "ingest-ci@aegisflow-ieee-quest.iam.gserviceaccount.com",
    private_key: await pemFromSubtle(),
    project_id: "aegisflow-ieee-quest",
  };
}

async function firmsFixture() {
  const result = await fetchFirmsHotspots(BBOX, { env: clearLiveEnv() });
  assert.equal(result.usedFixture, true);
  assert.equal(result.health.status, "ok");
  assert.match(result.health.detail, /no FIRMS_MAP_KEY/);
  assert.ok(result.hotspots.length >= 1);
  assert.equal(result.hotspots[0]?.source, "NASA_FIRMS_FIXTURE");
}

async function firmsLiveCsv() {
  const doFetch: IngestFetch = async (input) => {
    const url = String(input);
    assert.match(url, /firms\.modaps\.eosdis\.nasa\.gov/);
    assert.match(url, /VIIRS_SNPP_NRT/);
    return textResponse(FIRMS_CSV);
  };
  const result = await fetchFirmsHotspots(BBOX, {
    env: { FIRMS_MAP_KEY: "test-map-key" },
    fetch: doFetch,
  });
  assert.equal(result.usedFixture, false);
  assert.equal(result.health.status, "ok");
  assert.equal(result.hotspots.length, 2);
  assert.equal(result.hotspots[0]?.source, "NASA_FIRMS");
  assert.equal(result.hotspots[0]?.confidence, "high");
  assert.equal(result.hotspots[1]?.confidence, "nominal");
  assert.match(result.hotspots[0]!.eventId, /^evt_aegisfire01_live_/);
}

async function firmsHttpFail() {
  const result = await fetchFirmsHotspots(BBOX, {
    env: { FIRMS_MAP_KEY: "test-map-key" },
    fetch: async () => textResponse("denied", 403),
  });
  assert.equal(result.usedFixture, true);
  assert.equal(result.health.status, "degraded");
  assert.match(result.health.detail, /fixture in use/i);
  assert.equal(result.hotspots[0]?.degraded, true);
}

async function firmsZeroRows() {
  const result = await fetchFirmsHotspots(BBOX, {
    env: { FIRMS_MAP_KEY: "test-map-key" },
    fetch: async () =>
      textResponse("latitude,longitude,bright_ti4,acq_date,acq_time,confidence,frp\n"),
  });
  assert.equal(result.usedFixture, true);
  assert.equal(result.health.status, "degraded");
  assert.match(result.health.detail, /0 rows/);
}

async function windFixture() {
  const result = await fetchWindTicks(REGION, { env: clearLiveEnv() });
  assert.equal(result.usedFixture, true);
  assert.equal(result.health.status, "ok");
  assert.equal(result.health.label, "WeatherNext");
  assert.match(result.health.detail, /no GCP_SA_JSON/);
  assert.equal(result.wind[0]?.source, "MOCK_WIND");
}

async function windLiveClient() {
  const result = await fetchWindTicks(REGION, {
    env: clearLiveEnv(),
    client: {
      async queryWind(sql) {
        assert.match(sql, /aegisflow-ieee-quest/);
        assert.match(sql, /weathernext_3_0_0_0p1deg/);
        assert.match(sql, /ST_INTERSECTS/);
        assert.match(sql, /wind_speed_10m_mean/);
        assert.match(sql, /INTERVAL 12 HOUR/);
        assert.match(sql, /f\.hours BETWEEN 1 AND 6/);
        assert.match(sql, /LIMIT 24/);
        return [
          {
            lat: 44.31,
            lon: -121.64,
            forecastTime: "2026-09-16T19:00:00.000Z",
            speedMps: 12.4,
            gustMps: 18.1,
            u: 10.95,
            v: 5.85,
          },
        ];
      },
    },
  });
  assert.equal(result.usedFixture, false);
  assert.equal(result.health.status, "ok");
  assert.match(result.health.detail, /Experimental/);
  assert.equal(result.wind.length, 1);
  const tick = WindTickSchema.parse(result.wind[0]);
  assert.equal(tick.source, "WEATHERNEXT");
  assert.match(tick.eventId, /^evt_aegisfire01_wn_/);
}

async function windQueryFail() {
  const result = await fetchWindTicks(REGION, {
    env: { GCP_SA_JSON: "{}" },
    client: {
      async queryWind() {
        throw new Error("BigQuery HTTP 403");
      },
    },
  });
  assert.equal(result.usedFixture, true);
  assert.equal(result.health.status, "degraded");
  assert.equal(result.health.detail, WIND_FALLBACK_DETAIL);
  assert.doesNotMatch(result.health.detail, /BigQuery|timeout|403/i);
  assert.equal(
    publicWindBannerDetail(result.health.status, "BigQuery job did not complete within timeout"),
    WIND_FALLBACK_DETAIL,
  );
  assert.equal(isFeedUnhealthy({ overall: "degraded", feeds: [result.health], eventId: "evt_x_feed", schemaVersion: "1.0.0", producedAt: new Date().toISOString() }), true);
}

async function windForcedDown() {
  const result = await fetchWindTicks(REGION, {
    env: { AEGISFLOW_FAIL_WIND: "true" },
  });
  assert.equal(result.wind.length, 0);
  assert.equal(result.health.status, "down");
  assert.equal(result.health.detail, WIND_OFFLINE_DETAIL);
}

async function catalogAndSql() {
  assert.equal(WEATHERNEXT_CATALOG.gcpProjectId, "aegisflow-ieee-quest");
  assert.equal(WEATHERNEXT_CATALOG.experimental, true);
  assert.equal(
    WEATHERNEXT_CATALOG.earthEngine.grid01,
    "projects/gcp-public-data-weathernext/assets/weathernext_3_0_0_0p1deg",
  );
  const table = resolveWeatherNextTable({});
  assert.equal(table.projectId, "aegisflow-ieee-quest");
  assert.equal(table.datasetId, "weathernext");
  const sql = buildWeatherNextWindSql(BBOX, table);
  assert.match(sql, /`aegisflow-ieee-quest\.weathernext\.weathernext_3_0_0_0p1deg`/);
  assert.match(sql, /POLYGON\(\(-121\.9200 44\.1200/);
  assert.equal(
    [...sql.matchAll(/INTERVAL 12 HOUR/g)].length,
    2,
    "init_time lookback must apply to CTE and base table",
  );
  assert.match(sql, /t\.init_time = latest\.init_time/);
  assert.match(sql, /ST_INTERSECTS\(t\.geography,/);
  assert.doesNotMatch(sql, /geography_polygon/);
  assert.match(
    sql,
    new RegExp(
      `f\\.hours BETWEEN ${WEATHERNEXT_OPS_QUERY.leadHourMin} AND ${WEATHERNEXT_OPS_QUERY.leadHourMax}`,
    ),
  );
  assert.match(sql, new RegExp(`LIMIT ${WEATHERNEXT_OPS_QUERY.cellLimit}`));
  assert.doesNotMatch(sql, /INTERVAL 48 HOUR/);
  assert.doesNotMatch(sql, /LEAST\(48/);
  const sqlEs = buildWeatherNextWindSql(EL_SALVADOR_BBOX, table);
  assert.match(sqlEs, /POLYGON\(\(-90\.2000 13\.1000/);
  assert.match(sqlEs, /-87\.6500 14\.4800/);
  assert.equal(bboxPolygonWkt(BBOX).startsWith("POLYGON"), true);

  const dir = windDirectionFromUv(10.95, 5.85);
  assert.ok(dir >= 0 && dir < 360);

  const rows = parseWeatherNextQueryRows(
    ["lat", "lon", "forecast_time", "speed_mps", "gust_mps", "u", "v"],
    [
      {
        f: [
          { v: "44.31" },
          { v: "-121.64" },
          { v: "2026-09-16T19:00:00.000Z" },
          { v: "12.4" },
          { v: "18.1" },
          { v: "10.95" },
          { v: "5.85" },
        ],
      },
    ],
  );
  const ticks = mapWeatherNextRowsToWindTicks(rows);
  assert.equal(ticks.length, 1);
  WindTickSchema.parse(ticks[0]);
}

async function jwtAndBigQueryHttp() {
  resetGcpTokenCache();
  const sa = await testServiceAccount();
  const jwt = await signServiceAccountJwt(sa, 1_700_000_000);
  const [header] = jwt.split(".");
  assert.ok(header);
  const decoded = JSON.parse(
    Buffer.from(header.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
  ) as { alg?: string };
  assert.equal(decoded.alg, "RS256");

  const saJson = JSON.stringify(sa);
  const doFetch: IngestFetch = async (input) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com")) {
      return jsonResponse({ access_token: "ya29.test-token", expires_in: 3600 });
    }
    if (url.includes("bigquery.googleapis.com")) {
      return jsonResponse({
        jobComplete: true,
        schema: {
          fields: [
            { name: "lat" },
            { name: "lon" },
            { name: "forecast_time" },
            { name: "speed_mps" },
            { name: "gust_mps" },
            { name: "u" },
            { name: "v" },
          ],
        },
        rows: [
          {
            f: [
              { v: "44.32" },
              { v: "-121.55" },
              { v: "1768000000" },
              { v: "9.6" },
              { v: "14.2" },
              { v: "8.1" },
              { v: "5.2" },
            ],
          },
        ],
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const result = await fetchWindTicks(REGION, {
    env: { GCP_SA_JSON: saJson },
    fetch: doFetch,
  });
  assert.equal(result.usedFixture, false);
  assert.equal(result.wind[0]?.source, "WEATHERNEXT");
  WindTickSchema.parse(result.wind[0]);
}

function liveBqPayload(jobComplete = true) {
  return {
    jobComplete,
    jobReference: {
      projectId: "aegisflow-ieee-quest",
      jobId: "job_wind_1",
      location: "US",
    },
    schema: {
      fields: [
        { name: "lat" },
        { name: "lon" },
        { name: "forecast_time" },
        { name: "speed_mps" },
        { name: "gust_mps" },
        { name: "u" },
        { name: "v" },
      ],
    },
    rows: [
      {
        f: [
          { v: "13.69" },
          { v: "-89.22" },
          { v: "1768000000" },
          { v: "9.6" },
          { v: "14.2" },
          { v: "8.1" },
          { v: "5.2" },
        ],
      },
    ],
  };
}

async function bigQueryIncompleteThenPollSucceeds() {
  resetGcpTokenCache();
  const sa = await testServiceAccount();
  const calls: string[] = [];
  const doFetch: IngestFetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("oauth2.googleapis.com")) {
      return jsonResponse({ access_token: "ya29.poll-token", expires_in: 3600 });
    }
    if (url.includes("/queries/job_wind_1")) {
      return jsonResponse(liveBqPayload(true));
    }
    if (url.includes("bigquery.googleapis.com") && url.endsWith("/queries")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query?: string;
        timeoutMs?: number;
        maximumBytesBilled?: string;
      };
      assert.match(body.query ?? "", /INTERVAL 12 HOUR/);
      assert.match(body.query ?? "", /ST_INTERSECTS\(t\.geography/);
      assert.equal(body.timeoutMs, 12_000);
      assert.equal(body.maximumBytesBilled, BQ_MAX_BYTES_BILLED);
      return jsonResponse({ ...liveBqPayload(false), rows: undefined, schema: undefined });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const result = await fetchWindTicks(REGION, {
    env: { GCP_SA_JSON: JSON.stringify(sa) },
    fetch: doFetch,
  });
  assert.equal(result.usedFixture, false);
  assert.equal(result.health.status, "ok");
  assert.match(result.health.detail, /Experimental/);
  assert.equal(result.wind[0]?.source, "WEATHERNEXT");
  assert.equal(isLiveWeatherNextWind(result.wind[0]!), true);
  assert.equal(windOverlayColor(result.wind[0]!), WIND_LIVE_COLOR);
  assert.ok(calls.some((c) => c.startsWith("GET ") && c.includes("/queries/job_wind_1")));
}

async function bigQueryTimeoutFailsFastToFixture() {
  resetGcpTokenCache();
  const sa = await testServiceAccount();
  const started = Date.now();
  const doFetch: IngestFetch = async (input, init) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com")) {
      return jsonResponse({ access_token: "ya29.timeout-token", expires_in: 3600 });
    }
    if (url.includes("bigquery.googleapis.com")) {
      return jsonResponse({
        jobComplete: false,
        jobReference: {
          projectId: "aegisflow-ieee-quest",
          jobId: "job_slow",
          location: "US",
        },
      });
    }
    throw new Error(`unexpected fetch ${url} ${init?.method ?? ""}`);
  };

  const result = await fetchWindTicks(REGION, {
    env: { GCP_SA_JSON: JSON.stringify(sa) },
    fetch: doFetch,
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 3_000, `timeout path hung the Worker (${elapsed}ms)`);
  assert.equal(result.usedFixture, true);
  assert.equal(result.health.status, "degraded");
  assert.equal(result.health.detail, WIND_FALLBACK_DETAIL);
  assert.doesNotMatch(result.health.detail, /BigQuery job did not complete within timeout/);
  assert.doesNotMatch(result.health.detail, /timeout/i);
  assert.equal(result.wind[0]?.source, "MOCK_WIND");
  assert.equal(result.wind[0]?.degraded, true);
  assert.equal(isLiveWeatherNextWind(result.wind[0]!), false);
  assert.equal(windOverlayColor(result.wind[0]!), WIND_FALLBACK_COLOR);
  assert.equal(publicWindBannerDetail("degraded", result.health.detail), "Wind · fallback");
}

async function runBigQuerySqlTimeoutThrowsCode() {
  await assert.rejects(
    () =>
      runBigQuerySql(
        "SELECT 1",
        { projectId: "aegisflow-ieee-quest", location: "US" },
        "ya29.test",
        {
          fetch: async () =>
            jsonResponse({
              jobComplete: false,
              jobReference: { jobId: "job_x", location: "US" },
            }),
          budgetMs: 50,
          jobWaitMs: 10,
          maxPolls: 0,
        },
      ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, BQ_JOB_TIMEOUT_CODE);
      return true;
    },
  );
}

function windBannerCopyNeverLeaksTimeout() {
  assert.equal(
    publicWindBannerDetail("degraded", "BigQuery job did not complete within timeout"),
    WIND_FALLBACK_DETAIL,
  );
  assert.equal(
    publicWindBannerDetail("degraded", "Query exceeded limit for bytes billed"),
    WIND_FALLBACK_DETAIL,
  );
  assert.equal(publicWindBannerDetail("down", "forced wind adapter failure"), WIND_OFFLINE_DETAIL);
  assert.match(
    publicWindBannerDetail(
      "ok",
      "Experimental · weathernext_3_0_0_0p1deg · 8 10m cells · aegisflow-ieee-quest",
    ),
    /Experimental/,
  );
}

async function loadIncidentFixtureFallback() {
  const saved = stashEnv();
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    const incident = await loadOpsIncident();
    parseIncidentEvent(incident);
    assert.equal(incident.region.id, "el-salvador");
    assert.equal(incident.incidentId, "SV-WUI");
    assert.equal(incident.eventId, "evt_svwui_incident");
    assert.equal(incident.schemaVersion, "1.0.0");
    assert.ok(incident.hotspots.length > 0);
    assert.ok(incident.wind.length > 0);
    assert.equal(incident.feedHealth.overall, "ok");
    assert.equal(isFeedUnhealthy(incident.feedHealth), false);
    const windFeed = incident.feedHealth.feeds.find((f) => f.id === "wind");
    assert.equal(windFeed?.label, "WeatherNext");
  } finally {
    restoreEnv(saved);
  }
}

async function loadIncidentDegradedStaysUp() {
  const saved = stashEnv();
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.AEGISFLOW_FAIL_FIRMS = "true";
    process.env.AEGISFLOW_FAIL_WIND = "true";
    const incident = await loadOpsIncident();
    parseIncidentEvent(incident);
    assert.ok(incident.hotspots.length > 0);
    assert.equal(incident.wind.length, 0);
    assert.equal(incident.feedHealth.overall, "down");
    assert.equal(isFeedUnhealthy(incident.feedHealth), true);
    assert.ok(incident.agents.length >= 1);
  } finally {
    restoreEnv(saved);
  }
}

function uiWiring() {
  const map = readFileSync("src/components/ops/OpsMap.tsx", "utf8");
  assert.match(map, /MapLegendStack/);
  assert.match(map, /isFirmsDemoFixture/);
  assert.match(map, /windOverlayColor/);
  assert.match(map, /isLiveWeatherNextWind/);
  assert.match(map, /#3DB9FF/);
  const banner = readFileSync("src/components/ops/FeedBanner.tsx", "utf8");
  assert.match(banner, /publicWindBannerDetail/);
  assert.doesNotMatch(banner, /f\.label\}: \{f\.detail\}/);
  const top = readFileSync("src/components/ops/TopBar.tsx", "utf8");
  assert.match(top, /publicWindBannerDetail/);
  assert.match(top, /FirmsVerifyButton/);
  assert.doesNotMatch(top, /disabled=/);
  assert.doesNotMatch(top, /onRegionChange/);
  const picker = readFileSync("src/components/ops/RegionPicker.tsx", "utf8");
  assert.match(picker, /OPS_REGION_OPTIONS/);
  assert.match(picker, /method="get"/);
  assert.match(picker, /onchange="this\.form\.submit\(\)"/);
  const stack = readFileSync("src/components/ops/MapLegendStack.tsx", "utf8");
  assert.match(stack, /ExperimentalBadge/);
  assert.match(stack, /SimBadge label="RF"/);
  assert.match(stack, /SimBadge label="Edge"/);
  assert.match(stack, /DemoFixtureChip/);
  const shell = readFileSync("src/components/ops/OpsShell.tsx", "utf8");
  assert.match(shell, /FeedBanner/);
  assert.match(shell, /65%/);
  const regions = readFileSync("src/lib/regions.ts", "utf8");
  assert.match(regions, /El Salvador \/ WUI/);
  assert.match(regions, /Cascade \(AegisFire-01\)/);
  const summary = readFileSync("src/components/ops/ExecSummaryCard.tsx", "utf8");
  assert.match(summary, /WeatherNext/);
  const lineage = readFileSync("src/components/ops/LineageDrawer.tsx", "utf8");
  assert.match(lineage, /NASA FIRMS/);
  assert.match(lineage, /WeatherNext/);
  const fixture = readFileSync("fixtures/aegisfire-01.json", "utf8");
  assert.match(fixture, /WeatherNext 10m/);
  const workflow = readFileSync(".github/workflows/cloudflare-prod.yml", "utf8");
  assert.match(workflow, /npx wrangler secret put FIRMS_MAP_KEY/);
  assert.match(workflow, /npx wrangler secret put GCP_SA_JSON/);
}

async function main() {
  await firmsFixture();
  await firmsLiveCsv();
  await firmsHttpFail();
  await firmsZeroRows();
  await windFixture();
  await windLiveClient();
  await windQueryFail();
  await windForcedDown();
  await catalogAndSql();
  await jwtAndBigQueryHttp();
  await bigQueryIncompleteThenPollSucceeds();
  await bigQueryTimeoutFailsFastToFixture();
  await runBigQuerySqlTimeoutThrowsCode();
  windBannerCopyNeverLeaksTimeout();
  await loadIncidentFixtureFallback();
  await loadIncidentDegradedStaysUp();
  uiWiring();
  console.log("OK  ingest adapters (FIRMS + WeatherNext) with fixture fallback");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
