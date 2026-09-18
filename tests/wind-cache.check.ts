import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchWindTicks, queryLiveWindTicks, refreshPickerRegionWindCache } from "../src/lib/ingest/wind";
import {
  WIND_CACHE_CRON,
  WIND_CACHE_FRESH_MS,
  WIND_CACHE_KEY_PREFIX,
  WIND_CACHE_REGION_IDS,
  WIND_CACHE_VERSION,
  isFreshWindCache,
  memoryWindKv,
  parseWindCacheEntry,
  regionIdFromIngest,
  serializeWindCacheEntry,
  windCacheKey,
  writeWindCache,
} from "../src/lib/ingest/wind-cache";
import { buildWeatherNextWindSql, WEATHERNEXT_OPS_QUERY } from "../src/lib/ingest/weathernext";
import { loadOpsIncident } from "../src/lib/incident/load";
import {
  CASCADE_BBOX,
  EL_SALVADOR_BBOX,
  OPS_REGIONS,
} from "../src/lib/regions";
import { WindTickSchema } from "../src/lib/schema/zod";
import {
  WIND_FALLBACK_COLOR,
  WIND_FALLBACK_DETAIL,
  WIND_LIVE_COLOR,
  isLiveWeatherNextWind,
  publicWindBannerDetail,
  windChipDisplay,
  windOverlayColor,
} from "../src/lib/ui/wind-feed";
import type { IngestFetch } from "../src/lib/ingest/types";
import type { WindTick } from "../src/lib/schema";

const CASCADE = {
  id: "cascade" as const,
  bbox: CASCADE_BBOX,
  center: OPS_REGIONS.cascade.center,
};
const EL_SALVADOR = {
  id: "el-salvador" as const,
  bbox: EL_SALVADOR_BBOX,
  center: OPS_REGIONS["el-salvador"].center,
};

const LIVE_ROW = {
  lat: 44.31,
  lon: -121.64,
  forecastTime: "2026-09-16T19:00:00.000Z",
  speedMps: 12.4,
  gustMps: 18.1,
  u: 10.95,
  v: 5.85,
};

function liveTick(overrides: Partial<WindTick> = {}): WindTick {
  return WindTickSchema.parse({
    eventId: "evt_aegisfire01_wn_cache_01",
    schemaVersion: "1.0.0",
    lat: 44.31,
    lon: -121.64,
    speedMps: 12.4,
    directionDeg: 241.9,
    gustMps: 18.1,
    observedAt: "2026-09-16T19:00:00.000Z",
    source: "WEATHERNEXT",
    ...overrides,
  });
}

function mockClient(sqlSink?: string[]) {
  return {
    async queryWind(sql: string) {
      sqlSink?.push(sql);
      if (sql.includes("-90.2000")) {
        return [{ ...LIVE_ROW, lat: 13.69, lon: -89.22 }];
      }
      return [LIVE_ROW];
    },
  };
}

function keysOnly(regionIds: string[]) {
  return regionIds.map((id) => `${WIND_CACHE_KEY_PREFIX}${id}`);
}

async function catalogKeys() {
  assert.deepEqual([...WIND_CACHE_REGION_IDS], ["el-salvador", "cascade"]);
  assert.equal(windCacheKey("el-salvador"), "wind:el-salvador");
  assert.equal(windCacheKey("cascade"), "wind:cascade");
  assert.equal(WIND_CACHE_CRON, "*/8 * * * *");
  assert.equal(regionIdFromIngest({ bbox: EL_SALVADOR_BBOX, center: EL_SALVADOR.center }), "el-salvador");
  assert.equal(regionIdFromIngest(CASCADE), "cascade");
}

async function parseRejectsGarbage() {
  assert.equal(parseWindCacheEntry(null), null);
  assert.equal(parseWindCacheEntry("{"), null);
  assert.equal(parseWindCacheEntry("{}"), null);
  assert.equal(
    parseWindCacheEntry(
      serializeWindCacheEntry({
        v: WIND_CACHE_VERSION,
        regionId: "cascade",
        refreshedAt: new Date().toISOString(),
        ticks: [{ ...liveTick(), source: "MOCK_WIND" }],
      }),
    ),
    null,
    "MOCK_WIND must not count as LIVE cache",
  );
}

async function cacheHitIsLiveCyan() {
  const kv = memoryWindKv();
  await writeWindCache(kv, "cascade", [liveTick()], {
    tableId: "weathernext_3_0_0_0p1deg",
    refreshedAt: new Date().toISOString(),
  });
  let bqHits = 0;
  const fetchSpy: IngestFetch = async (input) => {
    bqHits += 1;
    throw new Error(`request path hit network ${String(input)}`);
  };
  const result = await fetchWindTicks(CASCADE, {
    kv,
    env: { GCP_SA_JSON: "{not-used}" },
    fetch: fetchSpy,
    client: {
      async queryWind() {
        throw new Error("request path must not query BigQuery");
      },
    },
  });
  assert.equal(bqHits, 0);
  assert.equal(result.usedFixture, false);
  assert.equal(result.fromCache, true);
  assert.equal(result.health.status, "ok");
  assert.match(result.health.detail, /Experimental/);
  assert.equal(result.wind[0]?.source, "WEATHERNEXT");
  assert.equal(isLiveWeatherNextWind(result.wind[0]!), true);
  assert.equal(windOverlayColor(result.wind[0]!), WIND_LIVE_COLOR);
  assert.equal(windChipDisplay(result.health.status, result.wind), "Live");
  assert.doesNotMatch(result.health.detail, /BigQuery|timeout/i);
}

async function cacheMissIsHonestFallback() {
  const kv = memoryWindKv();
  const fetchSpy: IngestFetch = async (input) => {
    throw new Error(`request path hit network ${String(input)}`);
  };
  const result = await fetchWindTicks(EL_SALVADOR, {
    kv,
    env: { GCP_SA_JSON: '{"client_email":"x@y"}' },
    fetch: fetchSpy,
  });
  assert.equal(result.usedFixture, true);
  assert.equal(result.fromCache, false);
  assert.equal(result.health.status, "degraded");
  assert.equal(result.health.detail, WIND_FALLBACK_DETAIL);
  assert.equal(result.wind[0]?.source, "MOCK_WIND");
  assert.equal(result.wind[0]?.degraded, true);
  assert.equal(isLiveWeatherNextWind(result.wind[0]!), false);
  assert.equal(windOverlayColor(result.wind[0]!), WIND_FALLBACK_COLOR);
  assert.equal(windChipDisplay(result.health.status, result.wind), "Degraded");
  assert.equal(
    publicWindBannerDetail(result.health.status, "BigQuery job did not complete within timeout"),
    WIND_FALLBACK_DETAIL,
  );
}

async function staleCacheFallsBack() {
  const kv = memoryWindKv();
  const refreshedAt = new Date(Date.now() - WIND_CACHE_FRESH_MS - 1_000).toISOString();
  await writeWindCache(kv, "el-salvador", [liveTick({ lat: 13.7, lon: -89.2 })], {
    refreshedAt,
  });
  const stored = parseWindCacheEntry(await kv.get("wind:el-salvador"));
  assert.ok(stored);
  assert.equal(isFreshWindCache(stored!, Date.now()), false);
  const result = await fetchWindTicks(EL_SALVADOR, { kv, env: {} });
  assert.equal(result.usedFixture, true);
  assert.equal(result.health.detail, WIND_FALLBACK_DETAIL);
  assert.equal(result.wind[0]?.source, "MOCK_WIND");
}

async function unboundKvSkipsWithoutBigQuery() {
  let bqHits = 0;
  const result = await fetchWindTicks(CASCADE, {
    kv: null,
    env: {},
    fetch: async (input) => {
      bqHits += 1;
      throw new Error(`unbound path hit network ${String(input)}`);
    },
  });
  assert.equal(bqHits, 0);
  assert.equal(result.usedFixture, true);
  assert.equal(result.health.status, "ok");
  assert.match(result.health.detail, /no GCP_SA_JSON/);
  assert.equal(result.wind[0]?.source, "MOCK_WIND");
  assert.notEqual(windChipDisplay(result.health.status, result.wind), "Live");
  assert.equal(windChipDisplay(result.health.status, result.wind), "Degraded");
}

async function refreshWritesBothPickerRegionsOnly() {
  const kv = memoryWindKv();
  const sqls: string[] = [];
  const results = await refreshPickerRegionWindCache({
    kv,
    env: {},
    client: mockClient(sqls),
  });
  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((r) => r.regionId).sort(),
    ["cascade", "el-salvador"],
  );
  assert.ok(results.every((r) => r.ok && r.cells === 1));
  assert.equal(sqls.length, 2);
  assert.ok(sqls.some((s) => s.includes("POLYGON((-90.2000 13.1000")));
  assert.ok(sqls.some((s) => s.includes("POLYGON((-121.9200 44.1200")));
  for (const sql of sqls) {
    assert.equal([...sql.matchAll(/INTERVAL 12 HOUR/g)].length, 2);
    assert.match(sql, /f\.hours BETWEEN 1 AND 6/);
    assert.match(sql, new RegExp(`LIMIT ${WEATHERNEXT_OPS_QUERY.cellLimit}`));
    assert.doesNotMatch(sql, /INTERVAL 48 HOUR/);
  }
  const storeKeys = keysOnly(["el-salvador", "cascade"]);
  for (const key of storeKeys) {
    const entry = parseWindCacheEntry(await kv.get(key));
    assert.ok(entry);
    assert.equal(entry!.ticks[0]?.source, "WEATHERNEXT");
  }
  assert.equal(await kv.get("wind:world"), null);

  const es = await fetchWindTicks(EL_SALVADOR, { kv, env: {} });
  const cascade = await fetchWindTicks(CASCADE, { kv, env: {} });
  assert.equal(es.fromCache, true);
  assert.equal(cascade.fromCache, true);
  assert.equal(es.wind[0]?.source, "WEATHERNEXT");
  assert.ok(Math.abs(es.wind[0]!.lat - 13.69) < 0.02);
}

async function refreshFailureDoesNotClobberCache() {
  const kv = memoryWindKv();
  await writeWindCache(kv, "cascade", [liveTick()], {
    refreshedAt: new Date().toISOString(),
  });
  const before = await kv.get("wind:cascade");
  await refreshPickerRegionWindCache({
    kv,
    env: { GCP_SA_JSON: "{}" },
    client: {
      async queryWind() {
        throw new Error("BigQuery HTTP 403");
      },
    },
  });
  assert.equal(await kv.get("wind:cascade"), before);
  const hit = await fetchWindTicks(CASCADE, { kv, env: {} });
  assert.equal(hit.fromCache, true);
  assert.equal(hit.wind[0]?.source, "WEATHERNEXT");
}

async function queryLiveKeepsSqlDiscipline() {
  const sqls: string[] = [];
  const ticks = await queryLiveWindTicks(CASCADE, {
    env: {},
    client: mockClient(sqls),
  });
  assert.equal(ticks[0]?.source, "WEATHERNEXT");
  assert.match(sqls[0]!, /INTERVAL 12 HOUR/);
  assert.match(sqls[0]!, /ST_INTERSECTS/);
  const tableSql = buildWeatherNextWindSql(EL_SALVADOR_BBOX);
  assert.match(tableSql, /LIMIT 24/);
}

async function loadIncidentCacheHit() {
  const kv = memoryWindKv();
  await writeWindCache(kv, "el-salvador", [liveTick({ lat: 13.69, lon: -89.22 })], {
    tableId: "weathernext_3_0_0_0p1deg",
  });
  const incident = await loadOpsIncident("el-salvador", {
    wind: { kv, env: {} },
  });
  assert.equal(incident.region.id, "el-salvador");
  assert.equal(incident.wind[0]?.source, "WEATHERNEXT");
  const windFeed = incident.feedHealth.feeds.find((f) => f.id === "wind");
  assert.equal(windFeed?.status, "ok");
  assert.match(windFeed?.detail ?? "", /Experimental/);
  assert.equal(windChipDisplay(windFeed!.status, incident.wind), "Live");
}

async function loadIncidentCacheMissStaysUp() {
  const incident = await loadOpsIncident("cascade", {
    wind: { kv: memoryWindKv(), env: {} },
  });
  assert.equal(incident.region.id, "cascade");
  assert.ok(incident.wind.length > 0);
  assert.equal(incident.wind[0]?.source, "MOCK_WIND");
  const windFeed = incident.feedHealth.feeds.find((f) => f.id === "wind");
  assert.equal(windFeed?.status, "degraded");
  assert.equal(windFeed?.detail, WIND_FALLBACK_DETAIL);
}

function windChipHonesty() {
  const fixture = [{ source: "MOCK_WIND" as const }];
  const live = [{ source: "WEATHERNEXT" as const }];
  assert.equal(windChipDisplay("ok", live), "Live");
  assert.equal(windChipDisplay("ok", fixture), "Degraded");
  assert.notEqual(windChipDisplay("ok", fixture), "Live");
  assert.equal(windChipDisplay("ok", [{ source: "IOT_WIND" }]), "Degraded");
  assert.equal(windChipDisplay("ok", []), "Degraded");
  assert.equal(windChipDisplay("degraded", live), "Degraded");
  assert.equal(windChipDisplay("down", live), "Offline");
}

function wranglerAndWorkflowWiring() {
  const wrangler = readFileSync("wrangler.jsonc", "utf8");
  assert.match(wrangler, /"main": "cloudflare-worker\.ts"/);
  assert.match(wrangler, /"binding": "WIND_CACHE"/);
  assert.match(wrangler, /\*\/8 \* \* \* \*/);
  assert.match(wrangler, /"@": "\.\/src"/);
  assert.match(wrangler, /"tsconfig": "\.\/tsconfig\.json"/);
  const worker = readFileSync("cloudflare-worker.ts", "utf8");
  assert.match(worker, /async scheduled\(/);
  assert.match(worker, /refreshPickerRegionWindCache/);
  assert.match(worker, /\.open-next\/worker\.js/);
  const workflow = readFileSync(".github/workflows/cloudflare-prod.yml", "utf8");
  assert.match(workflow, /ensure-wind-cache-kv\.mjs/);
  assert.match(workflow, /npx wrangler kv namespace create WIND_CACHE/);
  const top = readFileSync("src/components/ops/TopBar.tsx", "utf8");
  assert.match(top, /windChipDisplay/);
  assert.match(top, /windChipFeedStatus/);
  const map = readFileSync("src/components/ops/OpsMap.tsx", "utf8");
  assert.match(map, /windOverlayColor/);
  assert.match(map, /isLiveWeatherNextWind/);
}

async function main() {
  await catalogKeys();
  await parseRejectsGarbage();
  await cacheHitIsLiveCyan();
  await cacheMissIsHonestFallback();
  await staleCacheFallsBack();
  await unboundKvSkipsWithoutBigQuery();
  await refreshWritesBothPickerRegionsOnly();
  await refreshFailureDoesNotClobberCache();
  await queryLiveKeepsSqlDiscipline();
  await loadIncidentCacheHit();
  await loadIncidentCacheMissStaysUp();
  windChipHonesty();
  wranglerAndWorkflowWiring();
  console.log("OK  WeatherNext wind KV cache (picker regions, request path cache-only)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
