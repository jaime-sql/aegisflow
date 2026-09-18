import type { FeedComponent, WindTick } from "@/lib/schema";
import { loadFixtureIncident } from "@/lib/fixtures/aegisfire-01";
import { OPS_REGIONS, remapLatLonToBbox } from "@/lib/regions";
import {
  WIND_FALLBACK_DETAIL,
  WIND_OFFLINE_DETAIL,
  isLiveWeatherNextWind,
} from "@/lib/ui/wind-feed";
import { runBigQuerySql } from "./bigquery";
import { fetchGcpAccessToken, loadServiceAccountFromEnv } from "./gcp-auth";
import type { IngestFetch, IngestEnv, IngestRegion } from "./types";
import {
  WEATHERNEXT_CATALOG,
  buildWeatherNextWindSql,
  mapWeatherNextRowsToWindTicks,
  parseWeatherNextQueryRows,
  resolveWeatherNextTable,
} from "./weathernext";
import type { WeatherNextQueryClient } from "./weathernext";
import {
  WIND_CACHE_REGION_IDS,
  ingestEnvFromWorker,
  readFreshWindCache,
  regionIdFromIngest,
  writeWindCache,
  type WindKv,
  } from "./wind-cache";

export type WindResult = {
  wind: WindTick[];
  health: FeedComponent;
  usedFixture: boolean;
  fromCache?: boolean;
};

export type WindFetchDeps = {
  fetch?: IngestFetch;
  /** Live BigQuery/test client — **refresh path only**, never Ops/judge reads. */
  client?: WeatherNextQueryClient;
  env?: IngestEnv;
  /**
   * KV handle. `undefined` → resolve Worker binding when `CLOUDFLARE_PROD=true`.
   * `null` → treat as unbound (tests / local skip).
   */
  kv?: WindKv | null;
  nowMs?: number;
};

export type WindRefreshResult = {
  regionId: (typeof WIND_CACHE_REGION_IDS)[number];
  ok: boolean;
  cells: number;
  skipped?: boolean;
  error?: string;
};

function fixtureWind(region: IngestRegion): WindTick[] {
  return remapLatLonToBbox(loadFixtureIncident().wind, region.bbox);
}

function weatherNextHealth(
  status: FeedComponent["status"],
  detail: string,
  lastSuccessAt: string | null,
): FeedComponent {
  return {
    id: "wind",
    label: "WeatherNext",
    status,
    detail,
    lastSuccessAt,
  };
}

function liveWeatherNextEnabled(env: IngestEnv): boolean {
  if (env.AEGISFLOW_USE_WEATHERNEXT_FIXTURE === "true") return false;
  if (env.AEGISFLOW_LIVE_WEATHERNEXT === "false") return false;
  return Boolean(
    env.GCP_SA_JSON?.trim() ||
      env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim() ||
      env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  );
}

async function queryViaBigQuery(
  region: IngestRegion,
  env: IngestEnv,
  doFetch: IngestFetch,
): Promise<WindTick[]> {
  const sa = loadServiceAccountFromEnv(env);
  if (!sa) {
    throw new Error("no GCP service-account credentials");
  }
  const table = resolveWeatherNextTable(env);
  const token = await fetchGcpAccessToken(sa, { fetch: doFetch });
  const sql = buildWeatherNextWindSql(region.bbox, table);
  const { fields, rows } = await runBigQuerySql(
    sql,
    { projectId: table.projectId, location: table.location },
    token,
    { fetch: doFetch },
  );
  return mapWeatherNextRowsToWindTicks(parseWeatherNextQueryRows(fields, rows));
}

/**
 * BigQuery WeatherNext 10 m wind. **Cron / refresh only** — keep the #14
 * SQL budget (12h init_time, bbox, hours 1–6, LIMIT 24, fail-fast).
 */
export async function queryLiveWindTicks(
  region: IngestRegion,
  deps: WindFetchDeps = {},
): Promise<WindTick[]> {
  const env = deps.env ?? process.env;
  if (env.AEGISFLOW_FAIL_WIND === "true") {
    throw new Error("forced wind adapter failure");
  }
  if (!liveWeatherNextEnabled(env) && !deps.client) {
    throw new Error("WeatherNext live skipped");
  }
  if (deps.client) {
    return mapWeatherNextRowsToWindTicks(
      await deps.client.queryWind(
        buildWeatherNextWindSql(region.bbox, resolveWeatherNextTable(env)),
      ),
    );
  }
  return queryViaBigQuery(region, env, deps.fetch ?? fetch);
}

async function resolveWindKv(
  deps: WindFetchDeps,
  env: IngestEnv,
): Promise<WindKv | null> {
  if (deps.kv !== undefined) return deps.kv;
  if (env.CLOUDFLARE_PROD !== "true") return null;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    const kv = (ctx as { env?: { WIND_CACHE?: WindKv } }).env?.WIND_CACHE;
    if (kv && typeof kv.get === "function") return kv;
  } catch (err) {
    const message = err instanceof Error ? err.message : "kv unavailable";
    console.warn("[weathernext] WIND_CACHE unbound", message);
  }
  return null;
}

function liveCacheResult(
  ticks: WindTick[],
  tableId: string | undefined,
  now: string,
): WindResult {
  const table = tableId || resolveWeatherNextTable().tableId;
  return {
    wind: ticks,
    usedFixture: false,
    fromCache: true,
    health: weatherNextHealth(
      "ok",
      `Experimental · ${table} · ${ticks.length} 10m cells · ${WEATHERNEXT_CATALOG.gcpProjectId}`,
      ticks[0]?.observedAt ?? now,
    ),
  };
}

function fallbackResult(
  fixture: WindTick[],
  now: string,
  kind: "degraded" | "skip",
): WindResult {
  if (kind === "skip") {
    return {
      wind: fixture,
      usedFixture: true,
      fromCache: false,
      health: weatherNextHealth(
        "ok",
        "Fixture wind (no GCP_SA_JSON) — WeatherNext live skipped",
        fixture[0]?.observedAt ?? now,
      ),
    };
  }
  return {
    wind: fixture.map((w) => ({ ...w, degraded: true })),
    usedFixture: true,
    fromCache: false,
    health: weatherNextHealth("degraded", WIND_FALLBACK_DETAIL, now),
  };
}

/**
 * Ops / judge click path: **KV cache only**. Never runs BigQuery mid-request.
 * Fresh WEATHERNEXT cells → cyan LIVE. Empty/stale/miss → honest fixture fallback.
 */
export async function fetchWindTicks(
  region: IngestRegion,
  deps: WindFetchDeps = {},
): Promise<WindResult> {
  const now = new Date().toISOString();
  const env = deps.env ?? process.env;
  const fixture = fixtureWind(region);
  const regionId = regionIdFromIngest(region);
  const nowMs = deps.nowMs ?? Date.now();

  try {
    if (env.AEGISFLOW_FAIL_WIND === "true") {
      throw new Error("forced wind adapter failure");
    }

    const kv = await resolveWindKv(deps, env);
    if (kv) {
      const cached = await readFreshWindCache(kv, regionId, nowMs);
      if (cached) {
        return liveCacheResult(cached.ticks, cached.tableId, now);
      }
      return fallbackResult(fixture, now, "degraded");
    }

    if (!liveWeatherNextEnabled(env)) {
      return fallbackResult(fixture, now, "skip");
    }

    // Creds exist but KV is unbound — do not query BigQuery on the click path.
    return fallbackResult(fixture, now, "degraded");
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown wind error";
    console.warn("[weathernext]", message);
    if (env.AEGISFLOW_FAIL_WIND === "true") {
      return {
        wind: [],
        usedFixture: true,
        fromCache: false,
        health: weatherNextHealth("down", WIND_OFFLINE_DETAIL, null),
      };
    }
    return {
      wind: fixture.map((w) => ({ ...w, degraded: true })),
      usedFixture: true,
      fromCache: false,
      health: weatherNextHealth(
        "degraded",
        WIND_FALLBACK_DETAIL,
        fixture[0]?.observedAt ?? null,
      ),
    };
  }
}

/**
 * Cron / scheduled refresh: query both picker regions and write KV.
 * Failures leave the previous key in place (no empty overwrite).
 */
export async function refreshPickerRegionWindCache(
  deps: WindFetchDeps & { kv: WindKv },
): Promise<WindRefreshResult[]> {
  const env = deps.env ?? process.env;
  const results: WindRefreshResult[] = [];

  for (const regionId of WIND_CACHE_REGION_IDS) {
    const region = OPS_REGIONS[regionId];
    try {
      if (env.AEGISFLOW_USE_WEATHERNEXT_FIXTURE === "true") {
        results.push({ regionId, ok: false, cells: 0, skipped: true });
        continue;
      }
      const ticks = await queryLiveWindTicks(
        { id: regionId, bbox: region.bbox, center: region.center },
        deps,
      );
      if (ticks.length === 0 || !ticks.every((t) => isLiveWeatherNextWind(t))) {
        results.push({
          regionId,
          ok: false,
          cells: 0,
          error: "empty_or_not_live",
        });
        continue;
      }
      const table = resolveWeatherNextTable(env);
      await writeWindCache(deps.kv, regionId, ticks, { tableId: table.tableId });
      results.push({ regionId, ok: true, cells: ticks.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown wind error";
      console.warn("[weathernext] refresh", regionId, message);
      results.push({ regionId, ok: false, cells: 0, error: message });
    }
  }

  return results;
}

export { ingestEnvFromWorker };
export type { WindKv };
