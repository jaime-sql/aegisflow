import type { IngestFetch } from "./types";

/** Total wall budget for jobs.query + polls (under a ~30s Worker request). */
export const BQ_WORKER_BUDGET_MS = 22_000;

/** How long each BigQuery REST call waits for the job (`timeoutMs`). */
export const BQ_JOB_WAIT_MS = 12_000;

/** AbortSignal margin beyond `timeoutMs` so HTTP cannot outlive the job wait. */
export const BQ_HTTP_BUFFER_MS = 2_000;

/** One getQueryResults poll after an incomplete jobs.query, then fail fast. */
export const BQ_MAX_POLLS = 1;

export const BQ_MAX_RESULTS = 48;

/** Fail fast if the planner tries to scan the global 0.1° grid. */
export const BQ_MAX_BYTES_BILLED = "20000000000";

export const BQ_JOB_TIMEOUT_CODE = "weathernext_job_timeout";

export type BigQueryConfig = {
  projectId: string;
  location: string;
};

export type BigQueryField = { name: string; type?: string };

export type BigQueryRow = { f: Array<{ v?: string | null }> };

export type BigQueryJobReference = {
  projectId?: string;
  jobId?: string;
  location?: string;
};

export type BigQueryQueryResponse = {
  jobComplete?: boolean;
  jobReference?: BigQueryJobReference;
  schema?: { fields?: BigQueryField[] };
  rows?: BigQueryRow[];
  errors?: Array<{ message?: string }>;
  errorResult?: { message?: string };
  error?: { message?: string; errors?: Array<{ message?: string }> };
};

export type RunBigQuerySqlDeps = {
  fetch?: IngestFetch;
  budgetMs?: number;
  jobWaitMs?: number;
  maxPolls?: number;
};

export class BigQueryIncompleteJobError extends Error {
  constructor(message = BQ_JOB_TIMEOUT_CODE) {
    super(message);
    this.name = "BigQueryIncompleteJobError";
  }
}

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

function bqErrorMessage(
  json: BigQueryQueryResponse,
  httpStatus?: number,
): string | null {
  return (
    json.errorResult?.message ||
    json.errors?.[0]?.message ||
    json.error?.message ||
    json.error?.errors?.[0]?.message ||
    (httpStatus != null && httpStatus >= 400 ? `BigQuery HTTP ${httpStatus}` : null)
  );
}

function throwIfJobErrors(json: BigQueryQueryResponse): void {
  if (json.errorResult || (json.errors && json.errors.length > 0) || json.error) {
    throw new Error(bqErrorMessage(json) || "BigQuery job error");
  }
}

function resultsFrom(json: BigQueryQueryResponse): {
  fields: string[];
  rows: BigQueryRow[];
} {
  const fields = (json.schema?.fields ?? []).map((f) => f.name);
  return { fields, rows: json.rows ?? [] };
}

async function bqFetchJson(
  doFetch: IngestFetch,
  url: string,
  init: RequestInit,
): Promise<{ res: Response; json: BigQueryQueryResponse }> {
  const res = await doFetch(url, init);
  const json = (await res.json()) as BigQueryQueryResponse;
  return { res, json };
}

/**
 * jobs.query + at most one getQueryResults poll. Incomplete jobs throw
 * `BigQueryIncompleteJobError` instead of hanging on the Worker.
 */
export async function runBigQuerySql(
  sql: string,
  config: BigQueryConfig,
  accessToken: string,
  deps: RunBigQuerySqlDeps = {},
): Promise<{ fields: string[]; rows: BigQueryRow[] }> {
  const doFetch = deps.fetch ?? fetch;
  const projectId = bqIdentifier(config.projectId, "aegisflow-ieee-quest");
  const location = config.location || "US";
  const deadline = Date.now() + (deps.budgetMs ?? BQ_WORKER_BUDGET_MS);
  const waitMs = deps.jobWaitMs ?? BQ_JOB_WAIT_MS;
  const maxPolls = deps.maxPolls ?? BQ_MAX_POLLS;
  const headers = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };

  const queryUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`;
  const { res, json } = await bqFetchJson(doFetch, queryUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      timeoutMs: waitMs,
      maxResults: BQ_MAX_RESULTS,
      location,
      maximumBytesBilled: BQ_MAX_BYTES_BILLED,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(waitMs + BQ_HTTP_BUFFER_MS),
  });

  if (!res.ok) {
    throw new Error(bqErrorMessage(json, res.status) || `BigQuery HTTP ${res.status}`);
  }
  throwIfJobErrors(json);

  let current = json;
  let polls = 0;
  while (current.jobComplete === false) {
    const jobId = current.jobReference?.jobId;
    const jobLocation = current.jobReference?.location || location;
    const remaining = deadline - Date.now();
    if (!jobId || polls >= maxPolls || remaining < 1_500) {
      throw new BigQueryIncompleteJobError();
    }
    const pollWait = Math.min(waitMs, Math.max(1_000, remaining - BQ_HTTP_BUFFER_MS));
    polls += 1;
    const pollUrl =
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries/${encodeURIComponent(jobId)}` +
      `?location=${encodeURIComponent(jobLocation)}` +
      `&timeoutMs=${encodeURIComponent(String(pollWait))}` +
      `&maxResults=${BQ_MAX_RESULTS}`;
    const polled = await bqFetchJson(doFetch, pollUrl, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(pollWait + BQ_HTTP_BUFFER_MS),
    });
    if (!polled.res.ok) {
      throw new Error(
        bqErrorMessage(polled.json, polled.res.status) ||
          `BigQuery HTTP ${polled.res.status}`,
      );
    }
    throwIfJobErrors(polled.json);
    current = polled.json;
  }

  return resultsFrom(current);
}
