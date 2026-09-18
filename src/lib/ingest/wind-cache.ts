import type { WindTick } from "@/lib/schema";
import { WindTickSchema } from "@/lib/schema/zod";
import {
  DEFAULT_REGION_ID,
  OPS_REGIONS,
  REGION_IDS,
  bboxEquals,
  resolveRegionId,
  type RegionId,
} from "@/lib/regions";
import { isLiveWeatherNextWind } from "@/lib/ui/wind-feed";
import type { IngestEnv, IngestRegion } from "./types";

/**
 * Picker regions only (El Salvador / WUI + Cascade). Never world-wide.
 * Cron: ~8 min × 2 bboxes ≈ 12–16 cheap #14 queries/hour.
 */
export const WIND_CACHE_REGION_IDS = REGION_IDS;
export const WIND_CACHE_KEY_PREFIX = "wind:";
export const WIND_CACHE_CRON = "*/8 * * * *";
/** Treat as stale if older than this (covers one missed cron + KV lag). */
export const WIND_CACHE_FRESH_MS = 15 * 60 * 1000;
/** KV object expiry — miss becomes fixture fallback after this. */
export const WIND_CACHE_KV_TTL_SEC = 30 * 60;
export const WIND_CACHE_VERSION = 1 as const;

export type WindKv = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
};

export type WindCacheEntry = {
  v: typeof WIND_CACHE_VERSION;
  regionId: RegionId;
  refreshedAt: string;
  tableId?: string;
  ticks: WindTick[];
};

const INGEST_ENV_KEYS = [
  "GCP_SA_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  "GCP_PROJECT_ID",
  "WEATHERNEXT_BQ_PROJECT",
  "WEATHERNEXT_BQ_DATASET",
  "WEATHERNEXT_BQ_TABLE",
  "WEATHERNEXT_BQ_LOCATION",
  "AEGISFLOW_USE_WEATHERNEXT_FIXTURE",
  "AEGISFLOW_LIVE_WEATHERNEXT",
  "AEGISFLOW_FAIL_WIND",
  "CLOUDFLARE_PROD",
] as const;

export function windCacheKey(regionId: RegionId): string {
  return `${WIND_CACHE_KEY_PREFIX}${regionId}`;
}

export function isWindCacheRegionId(value: string): value is RegionId {
  return (WIND_CACHE_REGION_IDS as readonly string[]).includes(value);
}

/** Resolve picker region from ingest bbox / id. Unknown → El Salvador default. */
export function regionIdFromIngest(region: IngestRegion): RegionId {
  if (region.id) return resolveRegionId(region.id);
  for (const id of WIND_CACHE_REGION_IDS) {
    if (bboxEquals(region.bbox, OPS_REGIONS[id].bbox)) return id;
  }
  return DEFAULT_REGION_ID;
}

export function ingestEnvFromWorker(env: Record<string, unknown>): IngestEnv {
  const out: IngestEnv = {};
  for (const key of INGEST_ENV_KEYS) {
    const v = env[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

export function memoryWindKv(seed?: Record<string, string>): WindKv {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    async get(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

export function serializeWindCacheEntry(entry: WindCacheEntry): string {
  return JSON.stringify(entry);
}

export function parseWindCacheEntry(raw: string | null): WindCacheEntry | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;
  if (rec.v !== WIND_CACHE_VERSION) return null;
  if (typeof rec.regionId !== "string" || !isWindCacheRegionId(rec.regionId)) {
    return null;
  }
  if (typeof rec.refreshedAt !== "string") return null;
  const refreshed = new Date(rec.refreshedAt);
  if (Number.isNaN(refreshed.getTime())) return null;
  if (!Array.isArray(rec.ticks) || rec.ticks.length === 0) return null;
  const ticks: WindTick[] = [];
  for (const row of rec.ticks) {
    const tick = WindTickSchema.safeParse(row);
    if (!tick.success) return null;
    if (!isLiveWeatherNextWind(tick.data)) return null;
    ticks.push(tick.data);
  }
  const tableId = typeof rec.tableId === "string" ? rec.tableId : undefined;
  return {
    v: WIND_CACHE_VERSION,
    regionId: rec.regionId,
    refreshedAt: refreshed.toISOString(),
    tableId,
    ticks,
  };
}

export function isFreshWindCache(
  entry: WindCacheEntry,
  nowMs = Date.now(),
  freshMs = WIND_CACHE_FRESH_MS,
): boolean {
  const age = nowMs - Date.parse(entry.refreshedAt);
  return age >= 0 && age <= freshMs && entry.ticks.length > 0;
}

export async function readWindCache(
  kv: WindKv,
  regionId: RegionId,
): Promise<WindCacheEntry | null> {
  try {
    return parseWindCacheEntry(await kv.get(windCacheKey(regionId)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "kv get failed";
    console.warn("[weathernext] cache read", regionId, message);
    return null;
  }
}

export async function readFreshWindCache(
  kv: WindKv,
  regionId: RegionId,
  nowMs = Date.now(),
): Promise<WindCacheEntry | null> {
  const entry = await readWindCache(kv, regionId);
  if (!entry || !isFreshWindCache(entry, nowMs)) return null;
  return entry;
}

export async function writeWindCache(
  kv: WindKv,
  regionId: RegionId,
  ticks: WindTick[],
  meta: { tableId?: string; refreshedAt?: string } = {},
): Promise<void> {
  if (!isWindCacheRegionId(regionId)) {
    throw new Error(`refusing to cache non-picker region ${regionId}`);
  }
  if (ticks.length === 0 || !ticks.every((t) => isLiveWeatherNextWind(t))) {
    throw new Error("refusing to cache non-WEATHERNEXT ticks");
  }
  const entry: WindCacheEntry = {
    v: WIND_CACHE_VERSION,
    regionId,
    refreshedAt: meta.refreshedAt ?? new Date().toISOString(),
    tableId: meta.tableId,
    ticks,
  };
  await kv.put(windCacheKey(regionId), serializeWindCacheEntry(entry), {
    expirationTtl: WIND_CACHE_KV_TTL_SEC,
  });
}
