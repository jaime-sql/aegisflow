import { SCHEMA_VERSION } from "@/lib/schema";
import type { WindTick } from "@/lib/schema";
import { bqIdentifier, parseBqNumber, parseBqTimestamp, parseBqValue } from "./bigquery";
import type { BigQueryRow } from "./bigquery";
import type { BBox, IngestEnv } from "./types";

/**
 * WeatherNext 3 catalog for GCP project `aegisflow-ieee-quest`.
 *
 * BigQuery tables are **linked** into a subscriber dataset via Analytics Hub
 * (dataset id is chosen at subscribe time — default `weathernext`).
 * Earth Engine / GCS IDs are documented for a later adapter; this sprint
 * queries BigQuery only.
 */
export const WEATHERNEXT_CATALOG = {
  gcpProjectId: "aegisflow-ieee-quest",
  experimental: true,
  docs: "https://developers.google.com/weathernext/guides/bigquery",
  access: "https://developers.google.com/weathernext/guides/access-forecast",
  license: {
    historic: "CC BY 4.0",
    realtime:
      "GDM Real-Time Weather Forecasting Experimental Data Terms of Use",
  },
  bigquery: {
    listing: "WeatherNext 3 BigQuery Analytics Hub",
    defaultDataset: "weathernext",
    defaultLocation: "US",
    tables: {
      grid01: "weathernext_3_0_0_0p1deg",
      station005: "weathernext_3_0_0_0p05deg",
    },
  },
  earthEngine: {
    grid01: "projects/gcp-public-data-weathernext/assets/weathernext_3_0_0_0p1deg",
    station005:
      "projects/gcp-public-data-weathernext/assets/weathernext_3_0_0_0p05deg",
  },
  gcs: {
    ensemble: "gs://weathernext3_spatial/weathernext_3_0_0/zarr/",
    statistics:
      "gs://weathernext3_statistics_spatial/weathernext_3_0_0_statistics/zarr/",
  },
} as const;

export type WeatherNextTableConfig = {
  projectId: string;
  datasetId: string;
  tableId: string;
  location: string;
};

export type WeatherNextWindRow = {
  lat: number;
  lon: number;
  forecastTime: string;
  speedMps: number;
  gustMps?: number;
  u?: number;
  v?: number;
};

export type WeatherNextQueryClient = {
  queryWind(sql: string): Promise<WeatherNextWindRow[]>;
};

export function resolveWeatherNextTable(
  env: IngestEnv = process.env,
): WeatherNextTableConfig {
  return {
    projectId: bqIdentifier(
      env.GCP_PROJECT_ID || env.WEATHERNEXT_BQ_PROJECT || "",
      WEATHERNEXT_CATALOG.gcpProjectId,
    ),
    datasetId: bqIdentifier(
      env.WEATHERNEXT_BQ_DATASET || "",
      WEATHERNEXT_CATALOG.bigquery.defaultDataset,
    ),
    tableId: bqIdentifier(
      env.WEATHERNEXT_BQ_TABLE || "",
      WEATHERNEXT_CATALOG.bigquery.tables.grid01,
    ),
    location:
      env.WEATHERNEXT_BQ_LOCATION?.trim() ||
      WEATHERNEXT_CATALOG.bigquery.defaultLocation,
  };
}

/** Worker-safe Ops snapshot: latest partition, active bbox, few lead hours. */
export const WEATHERNEXT_OPS_QUERY = {
  initLookbackHours: 12,
  leadHourMin: 1,
  leadHourMax: 6,
  cellLimit: 24,
} as const;

export function bboxPolygonWkt(bbox: BBox): string {
  const [west, south, east, north] = bbox;
  for (const n of bbox) {
    if (!Number.isFinite(n)) throw new Error("bbox must be finite numbers");
  }
  const w = west.toFixed(4);
  const s = south.toFixed(4);
  const e = east.toFixed(4);
  const n = north.toFixed(4);
  return `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
}

/**
 * Latest init in the active bbox, small lead-hour window, 10 m wind cells.
 * `init_time` is filtered on both the CTE and the base table so BigQuery can
 * prune partitions; spatial filter uses clustered `geography` (cell center).
 */
export function buildWeatherNextWindSql(
  bbox: BBox,
  table = resolveWeatherNextTable(),
): string {
  const fq = `\`${table.projectId}.${table.datasetId}.${table.tableId}\``;
  const polygon = bboxPolygonWkt(bbox);
  const lookback = WEATHERNEXT_OPS_QUERY.initLookbackHours;
  const leadMin = WEATHERNEXT_OPS_QUERY.leadHourMin;
  const leadMax = WEATHERNEXT_OPS_QUERY.leadHourMax;
  const cellLimit = WEATHERNEXT_OPS_QUERY.cellLimit;
  const initWindow = `init_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${lookback} HOUR)`;
  const spatial = `ST_INTERSECTS(geography, ST_GEOGFROMTEXT('${polygon}'))`;
  return `
WITH latest AS (
  SELECT MAX(init_time) AS init_time
  FROM ${fq}
  WHERE ${initWindow}
    AND ${spatial}
)
SELECT
  ST_Y(t.geography) AS lat,
  ST_X(t.geography) AS lon,
  f.time AS forecast_time,
  f.wind_speed_10m_mean AS speed_mps,
  f.wind_speed_10m_p90 AS gust_mps,
  f.u_component_of_wind_10m_mean AS u,
  f.v_component_of_wind_10m_mean AS v
FROM ${fq} AS t, t.forecast AS f, latest
WHERE t.init_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${lookback} HOUR)
  AND t.init_time = latest.init_time
  AND latest.init_time IS NOT NULL
  AND ST_INTERSECTS(t.geography, ST_GEOGFROMTEXT('${polygon}'))
  AND f.hours BETWEEN ${leadMin} AND ${leadMax}
  AND f.hours = GREATEST(${leadMin}, LEAST(${leadMax}, TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), latest.init_time, HOUR)))
LIMIT ${cellLimit}
`.trim();
}

export function parseWeatherNextQueryRows(
  fields: string[],
  rows: BigQueryRow[],
): WeatherNextWindRow[] {
  const out: WeatherNextWindRow[] = [];
  for (const row of rows) {
    const lat = parseBqNumber(parseBqValue(row, fields, "lat"));
    const lon = parseBqNumber(parseBqValue(row, fields, "lon"));
    const forecastTime = parseBqTimestamp(parseBqValue(row, fields, "forecast_time"));
    let speed = parseBqNumber(parseBqValue(row, fields, "speed_mps"));
    const gust = parseBqNumber(parseBqValue(row, fields, "gust_mps"));
    const u = parseBqNumber(parseBqValue(row, fields, "u"));
    const v = parseBqNumber(parseBqValue(row, fields, "v"));
    if (lat == null || lon == null || !forecastTime) continue;
    if (speed == null && u != null && v != null) {
      speed = Math.hypot(u, v);
    }
    if (speed == null || speed < 0) continue;
    out.push({
      lat,
      lon,
      forecastTime,
      speedMps: speed,
      gustMps: gust ?? undefined,
      u: u ?? undefined,
      v: v ?? undefined,
    });
  }
  return out;
}

/** Meteorological direction: degrees the wind blows FROM (0 = north). */
export function windDirectionFromUv(u: number, v: number): number {
  const deg = (Math.atan2(-u, -v) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function windEventId(lat: number, lon: number, index: number): string {
  const token = `${lat.toFixed(3)}_${lon.toFixed(3)}_${index}`
    .replace(/-/g, "m")
    .replace(/\./g, "p")
    .replace(/[^0-9a-z_]/gi, "");
  return `evt_aegisfire01_wn_${token}`.toLowerCase().slice(0, 80);
}

export function sampleRows<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const stride = rows.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    out.push(rows[Math.floor(i * stride)]!);
  }
  return out;
}

export function mapWeatherNextRowsToWindTicks(
  rows: WeatherNextWindRow[],
  max = 16,
): WindTick[] {
  const sampled = sampleRows(rows, max);
  const ticks: WindTick[] = [];
  sampled.forEach((row, index) => {
    if (row.u == null || row.v == null) return;
    const tick: WindTick = {
      eventId: windEventId(row.lat, row.lon, index),
      schemaVersion: SCHEMA_VERSION,
      lat: row.lat,
      lon: row.lon,
      speedMps: Number(row.speedMps.toFixed(2)),
      directionDeg: Number(windDirectionFromUv(row.u, row.v).toFixed(1)) % 360,
      gustMps:
        row.gustMps != null ? Number(row.gustMps.toFixed(1)) : undefined,
      observedAt: row.forecastTime,
      source: "WEATHERNEXT",
    };
    ticks.push(tick);
  });
  return ticks;
}
