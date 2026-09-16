import type { FeedComponent, WindTick } from "@/lib/schema";
import { loadFixtureIncident } from "@/lib/fixtures/aegisfire-01";
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

export type WindResult = {
  wind: WindTick[];
  health: FeedComponent;
  usedFixture: boolean;
};

export type WindFetchDeps = {
  fetch?: IngestFetch;
  client?: WeatherNextQueryClient;
  env?: IngestEnv;
};

function fixtureWind(): WindTick[] {
  return loadFixtureIncident().wind;
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
 * WeatherNext 10 m wind over the ops bbox (BigQuery Analytics Hub tables).
 * Falls back to AegisFire-01 fixture when credentials are missing or the
 * query fails (graceful degrade — Ops stays up).
 */
export async function fetchWindTicks(
  region: IngestRegion,
  deps: WindFetchDeps = {},
): Promise<WindResult> {
  const now = new Date().toISOString();
  const env = deps.env ?? process.env;
  const fixture = fixtureWind();

  try {
    if (env.AEGISFLOW_FAIL_WIND === "true") {
      throw new Error("forced wind adapter failure");
    }

    if (!liveWeatherNextEnabled(env) && !deps.client) {
      return {
        wind: fixture,
        usedFixture: true,
        health: weatherNextHealth(
          "ok",
          "Fixture wind (no GCP_SA_JSON) — WeatherNext live skipped",
          fixture[0]?.observedAt ?? now,
        ),
      };
    }

    const wind = deps.client
      ? mapWeatherNextRowsToWindTicks(
          await deps.client.queryWind(
            buildWeatherNextWindSql(region.bbox, resolveWeatherNextTable(env)),
          ),
        )
      : await queryViaBigQuery(region, env, deps.fetch ?? fetch);

    if (wind.length === 0) {
      return {
        wind: fixture.map((w) => ({ ...w, degraded: true })),
        usedFixture: true,
        health: weatherNextHealth(
          "degraded",
          "WeatherNext returned 0 cells — using fixture · Experimental",
          now,
        ),
      };
    }

    const table = resolveWeatherNextTable(env);
    return {
      wind,
      usedFixture: false,
      health: weatherNextHealth(
        "ok",
        `Experimental · ${table.tableId} · ${wind.length} 10m cells · ${WEATHERNEXT_CATALOG.gcpProjectId}`,
        wind[0]?.observedAt ?? now,
      ),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown wind error";
    if (env.AEGISFLOW_FAIL_WIND === "true") {
      return {
        wind: [],
        usedFixture: true,
        health: weatherNextHealth(
          "down",
          `Wind adapter failed (${message}) — map continues without vectors`,
          null,
        ),
      };
    }
    return {
      wind: fixture.map((w) => ({ ...w, degraded: true })),
      usedFixture: true,
      health: weatherNextHealth(
        "degraded",
        `WeatherNext pull failed (${message}) — fixture in use · Experimental`,
        fixture[0]?.observedAt ?? null,
      ),
    };
  }
}
