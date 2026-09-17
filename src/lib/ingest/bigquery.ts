import type { IngestFetch } from "./types";

export type BigQueryConfig = {
  projectId: string;
  location: string;
};

export type BigQueryField = { name: string; type?: string };

export type BigQueryRow = { f: Array<{ v?: string | null }> };

export type BigQueryQueryResponse = {
  jobComplete?: boolean;
  schema?: { fields?: BigQueryField[] };
  rows?: BigQueryRow[];
  errors?: Array<{ message?: string }>;
  errorResult?: { message?: string };
};

export function bqIdentifier(raw: string, fallback: string): string {
  const v = (raw || fallback).trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(v)) {
    throw new Error(`invalid BigQuery identifier: ${v.slice(0, 32)}`);
  }
  return v;
}

export function parseBqValue(
  row: BigQueryRow,
  fields: string[],
  name: string,
): string | null {
  const i = fields.indexOf(name);
  if (i < 0) return null;
  const v = row.f[i]?.v;
  return v == null || v === "" ? null : v;
}

export function parseBqNumber(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** BigQuery REST timestamps are ISO or epoch seconds (sometimes with fractional). */
export function parseBqTimestamp(raw: string | null): string | null {
  if (raw == null) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function runBigQuerySql(
  sql: string,
  config: BigQueryConfig,
  accessToken: string,
  deps: { fetch?: IngestFetch } = {},
): Promise<{ fields: string[]; rows: BigQueryRow[] }> {
  const doFetch = deps.fetch ?? fetch;
  const projectId = bqIdentifier(config.projectId, "aegisflow-ieee-quest");
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`;
  const res = await doFetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      timeoutMs: 20_000,
      maxResults: 48,
      location: config.location || "US",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(22_000),
  });
  const json = (await res.json()) as BigQueryQueryResponse;
  if (!res.ok) {
    const msg =
      json.errorResult?.message ||
      json.errors?.[0]?.message ||
      `BigQuery HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (json.jobComplete === false) {
    throw new Error("BigQuery job did not complete within timeout");
  }
  const fields = (json.schema?.fields ?? []).map((f) => f.name);
  return { fields, rows: json.rows ?? [] };
}
