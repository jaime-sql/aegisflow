import type { FeedComponent, Hotspot } from "@/lib/schema";
import { SCHEMA_VERSION } from "@/lib/schema";
import { loadFixtureIncident } from "@/lib/fixtures/aegisfire-01";
import { remapLatLonToBbox, resolveOpsRegion } from "@/lib/regions";
import type { BBox, IngestFetch, IngestEnv } from "./types";

/** Cap live detections per bbox; never collapse the set to a single demo point. */
export const MAX_FIRMS_HOTSPOTS = 40;

/** Default NRT stack — denser coverage than a single VIIRS bird (FIRMS Fire Map style). */
export const DEFAULT_FIRMS_PRODUCTS = [
  "VIIRS_SNPP_NRT",
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA21_NRT",
] as const;

/** Default lookback days (FIRMS area API allows 1–5). */
export const DEFAULT_FIRMS_DAY_RANGE = 2;

export type FirmsResult = {
  hotspots: Hotspot[];
  health: FeedComponent;
  usedFixture: boolean;
};

export type FirmsFetchDeps = {
  fetch?: IngestFetch;
  env?: IngestEnv;
};

function mapConfidence(raw: string | undefined): Hotspot["confidence"] {
  const v = (raw ?? "").toLowerCase();
  if (v === "h" || v === "high") return "high";
  if (v === "n" || v === "nominal") return "nominal";
  return "low";
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i]?.trim() ?? "";
    });
    return row;
  });
}

function hotspotEventId(lat: number, lon: number, acquired: string, index: number): string {
  const token = `${lat.toFixed(4)}_${lon.toFixed(4)}_${acquired}_${index}`.replace(/[^0-9a-z_]/gi, "");
  return `evt_aegisfire01_live_${token}`.toLowerCase().slice(0, 80);
}

export function resolveFirmsProducts(env: IngestEnv = process.env): string[] {
  const raw = env.FIRMS_PRODUCT?.trim();
  if (!raw) return [...DEFAULT_FIRMS_PRODUCTS];
  const parts = raw
    .split(/[,+\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [...DEFAULT_FIRMS_PRODUCTS];
}

export function resolveFirmsDayRange(env: IngestEnv = process.env): number {
  const n = Number(env.FIRMS_DAY_RANGE ?? DEFAULT_FIRMS_DAY_RANGE);
  if (!Number.isFinite(n)) return DEFAULT_FIRMS_DAY_RANGE;
  return Math.min(5, Math.max(1, Math.floor(n)));
}

function firmsAreaUrl(
  bbox: BBox,
  key: string,
  product: string,
  dayRange: number,
): string {
  const [west, south, east, north] = bbox;
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${product}/${west},${south},${east},${north}/${dayRange}`;
}

function countValidFirmsRows(text: string): number {
  return parseCsv(text).filter((row) => {
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon);
  }).length;
}

function rowsToHotspots(text: string, product: string): Hotspot[] {
  return parseCsv(text)
    .map((row, index) => {
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const date = row.acq_date || "1970-01-01";
      const time = (row.acq_time || "0000").padStart(4, "0");
      const observedAt = `${date}T${time.slice(0, 2)}:${time.slice(2, 4)}:00.000Z`;
      const hotspot: Hotspot = {
        eventId: hotspotEventId(lat, lon, `${date}${time}_${product}`, index),
        schemaVersion: SCHEMA_VERSION,
        lat,
        lon,
        brightnessK: Number(row.bright_ti4 || row.brightness || 0),
        confidence: mapConfidence(row.confidence),
        frpMw: Number(row.frp) || undefined,
        observedAt,
        satellite: row.satellite || product,
        source: "NASA_FIRMS",
      };
      return hotspot;
    })
    .filter((h): h is Hotspot => h !== null);
}

/** Prefer higher FRP / brightness when sensors report the same cell. */
function dedupeHotspots(hotspots: Hotspot[]): Hotspot[] {
  const byKey = new Map<string, Hotspot>();
  for (const h of hotspots) {
    const key = `${h.lat.toFixed(3)}_${h.lon.toFixed(3)}_${h.observedAt}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, h);
      continue;
    }
    const prevScore = (prev.frpMw ?? 0) + prev.brightnessK;
    const nextScore = (h.frpMw ?? 0) + h.brightnessK;
    if (nextScore > prevScore) byKey.set(key, h);
  }
  return [...byKey.values()];
}

function productLabel(products: string[]): string {
  if (products.length === 1) return products[0]!;
  const short = products.map((p) =>
    p.replace(/_NRT$/i, "").replace(/^VIIRS_/i, ""),
  );
  return short.join("+");
}

export type FirmsProbeResult = {
  live: boolean;
  rowCount: number;
  /** Judge-facing line: `12 rows · LIVE` or the last clear error. */
  summary: string;
  error: string | null;
};

export type FirmsVerifyResult = FirmsProbeResult & {
  regionId: string;
  bbox: BBox;
};

function failProbe(error: string): FirmsProbeResult {
  return { live: false, rowCount: 0, summary: error, error };
}

type ProductPull =
  | { ok: true; product: string; hotspots: Hotspot[]; rowCount: number }
  | { ok: false; product: string; error: string };

async function pullFirmsProduct(
  bbox: BBox,
  key: string,
  product: string,
  dayRange: number,
  doFetch: IngestFetch,
): Promise<ProductPull> {
  try {
    const res = await doFetch(firmsAreaUrl(bbox, key, product, dayRange), {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      return { ok: false, product, error: `FIRMS HTTP ${res.status}` };
    }
    const text = await res.text();
    if (/invalid|error|denied/i.test(text.slice(0, 200)) && !text.includes("latitude")) {
      return {
        ok: false,
        product,
        error: "FIRMS rejected MAP_KEY or returned an error body",
      };
    }
    const hotspots = rowsToHotspots(text, product);
    return {
      ok: true,
      product,
      hotspots,
      rowCount: countValidFirmsRows(text),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown FIRMS error";
    return { ok: false, product, error: message };
  }
}

/**
 * Diagnostic FIRMS pull for the active bbox. Never returns hotspot dots —
 * Ops map keeps using loadOpsIncident (live or remapped fixture).
 */
export async function probeFirms(
  bbox: BBox,
  deps: FirmsFetchDeps = {},
): Promise<FirmsProbeResult> {
  const env = deps.env ?? process.env;
  const key = env.FIRMS_MAP_KEY?.trim();
  const doFetch = deps.fetch ?? fetch;

  if (env.AEGISFLOW_FAIL_FIRMS === "true") {
    return failProbe("Live pull failed (forced FIRMS adapter failure)");
  }
  if (!key) {
    return failProbe("no FIRMS_MAP_KEY");
  }

  const products = resolveFirmsProducts(env);
  const dayRange = resolveFirmsDayRange(env);
  const pulls = await Promise.all(
    products.map((product) => pullFirmsProduct(bbox, key, product, dayRange, doFetch)),
  );
  const okPulls = pulls.filter((p): p is Extract<ProductPull, { ok: true }> => p.ok);
  if (okPulls.length === 0) {
    const first = pulls.find((p) => !p.ok);
    return failProbe(first && !first.ok ? first.error : "FIRMS pull failed");
  }
  const rowCount = okPulls.reduce((sum, p) => sum + p.rowCount, 0);
  return {
    live: true,
    rowCount,
    summary: `${rowCount} rows · LIVE`,
    error: null,
  };
}

function fixtureHotspotsForBbox(bbox: BBox): Hotspot[] {
  return remapLatLonToBbox(loadFixtureIncident().hotspots, bbox);
}

/**
 * NASA FIRMS area CSV across one or more NRT products. Falls back to
 * AegisFire-01 fixture when FIRMS_MAP_KEY is missing or every product fails.
 * Quiet live days return an empty hotspot list (honest empty — not fixture).
 * Docs: https://firms.modaps.eosdis.nasa.gov/api/area/
 */
export async function fetchFirmsHotspots(
  bbox: BBox,
  deps: FirmsFetchDeps = {},
): Promise<FirmsResult> {
  const now = new Date().toISOString();
  const env = deps.env ?? process.env;
  const key = env.FIRMS_MAP_KEY?.trim();
  const fixture = fixtureHotspotsForBbox(bbox);
  const doFetch = deps.fetch ?? fetch;

  if (env.AEGISFLOW_FAIL_FIRMS === "true") {
    return {
      hotspots: fixture.map((h) => ({ ...h, degraded: true })),
      usedFixture: true,
      health: {
        id: "firms",
        label: "NASA FIRMS",
        status: "degraded",
        detail: "Live pull failed (forced FIRMS adapter failure) — fixture in use",
        lastSuccessAt: fixture[0]?.observedAt ?? null,
      },
    };
  }

  if (!key || env.AEGISFLOW_USE_FIRMS_FIXTURE === "true") {
    return {
      hotspots: fixture,
      usedFixture: true,
      health: {
        id: "firms",
        label: "NASA FIRMS",
        status: "ok",
        detail: "Fixture VIIRS hotspots (no FIRMS_MAP_KEY)",
        lastSuccessAt: fixture[0]?.observedAt ?? now,
      },
    };
  }

  const products = resolveFirmsProducts(env);
  const dayRange = resolveFirmsDayRange(env);
  const label = productLabel(products);

  const pulls = await Promise.all(
    products.map((product) => pullFirmsProduct(bbox, key, product, dayRange, doFetch)),
  );
  const okPulls = pulls.filter((p): p is Extract<ProductPull, { ok: true }> => p.ok);
  const failPulls = pulls.filter((p): p is Extract<ProductPull, { ok: false }> => !p.ok);

  if (okPulls.length === 0) {
    const message = failPulls[0]?.error ?? "unknown FIRMS error";
    return {
      hotspots: fixture.map((h) => ({ ...h, degraded: true })),
      usedFixture: true,
      health: {
        id: "firms",
        label: "NASA FIRMS",
        status: "degraded",
        detail: `Live pull failed (${message}) — fixture in use`,
        lastSuccessAt: fixture[0]?.observedAt ?? null,
      },
    };
  }

  const hotspots = dedupeHotspots(okPulls.flatMap((p) => p.hotspots)).slice(
    0,
    MAX_FIRMS_HOTSPOTS,
  );

  const partialNote =
    failPulls.length > 0 ? ` · ${failPulls.length} sensor(s) failed` : "";

  if (hotspots.length === 0) {
    return {
      hotspots: [],
      usedFixture: false,
      health: {
        id: "firms",
        label: "NASA FIRMS",
        status: "ok",
        detail: `Live ${label} · 0 detections (quiet bbox)${partialNote}`,
        lastSuccessAt: now,
      },
    };
  }

  return {
    hotspots,
    usedFixture: false,
    health: {
      id: "firms",
      label: "NASA FIRMS",
      status: failPulls.length > 0 ? "degraded" : "ok",
      detail: `Live ${label} · ${hotspots.length} detections${partialNote}`,
      lastSuccessAt: now,
    },
  };
}

/** Probe the active Ops region bbox. Result is diagnostic JSON only — no map dots. */
export async function verifyFirmsForRegion(
  regionId?: string | null,
  deps: FirmsFetchDeps = {},
): Promise<FirmsVerifyResult> {
  const region = resolveOpsRegion(regionId);
  const probe = await probeFirms(region.bbox, deps);
  return {
    regionId: region.id,
    bbox: region.bbox,
    ...probe,
  };
}
