import { NextResponse } from "next/server";
import {
  logWindCacheRefresh,
  refreshPickerRegionWindCache,
  resolveWindKv,
  windCacheRefreshLogPayload,
} from "@/lib/ingest/wind";

export const dynamic = "force-dynamic";

/**
 * One-shot WeatherNext KV fill (Clerk-protected via middleware, same as Ops).
 * Uses the cron BigQuery budget so Jaime can seed cache without waiting ~8 min.
 */
async function handleRefresh() {
  const env = process.env;
  const kv = await resolveWindKv({}, env);
  if (!kv) {
    const log = windCacheRefreshLogPayload([], { trigger: "admin" });
    console.warn("[weathernext] WIND_CACHE unbound; skip admin refresh");
    return NextResponse.json(
      { ...log, ok: false, error: "WIND_CACHE unbound" },
      { status: 503 },
    );
  }
  const results = await refreshPickerRegionWindCache({ kv, env });
  const log = logWindCacheRefresh(results, { trigger: "admin" });
  return NextResponse.json(log);
}

export async function GET() {
  return handleRefresh();
}

export async function POST() {
  return handleRefresh();
}
