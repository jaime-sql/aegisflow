import type { FeedComponent, Hotspot } from "@/lib/schema";
import { SCHEMA_VERSION } from "@/lib/schema";
import { loadFixtureIncident } from "@/lib/fixtures/aegisfire-01";
import { remapLatLonToBbox, resolveOpsRegion } from "@/lib/regions";
import type { BBox, IngestFetch, IngestEnv } from "./types";

/** Cap live detections per bbox; never collapse the set to a single demo point. */
export const MAX_FIRMS_HOTSPOTS = 40;

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

function firmsAreaUrl(bbox: BBox, key: string, product: string): string {
  const [west, south, east, north] = bbox;
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${product}/${west},${south},${east},${north}/1`;
}

function countValidFirmsRows(text: string): number {
  return parseCsv(text).filter((row) => {
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon);
  }).length;
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

  const product = env.FIRMS_PRODUCT?.trim() || "VIIRS_SNPP_NRT";
  try {
    const res = await doFetch(firmsAreaUrl(bbox, key, product), {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new Error(`FIRMS HTTP ${res.status}`);
    }
    const text = await res.text();
    if (/invalid|error|denied/i.test(text.slice(0, 200)) && !text.includes("latitude")) {
      throw new Error("FIRMS rejected MAP_KEY or returned an error body");
    }
    const rowCount = countValidFirmsRows(text);
    return {
      live: true,
      rowCount,
      summary: `${rowCount} rows · LIVE`,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown FIRMS error";
    return failProbe(message);
  }
}

function fixtureHotspotsForBbox(bbox: BBox): Hotspot[] {
  return remapLatLonToBbox(loadFixtureIncident().hotspots, bbox);
}

/**
 * NASA FIRMS area CSV. Falls back to AegisFire-01 fixture when FIRMS_MAP_KEY
 * is missing or the request fails (graceful degrade).
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

  const product = env.FIRMS_PRODUCT?.trim() || "VIIRS_SNPP_NRT";

  try {
    const res = await doFetch(firmsAreaUrl(bbox, key, product), {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new Error(`FIRMS HTTP ${res.status}`);
    }
    const text = await res.text();
    if (/invalid|error|denied/i.test(text.slice(0, 200)) && !text.includes("latitude")) {
      throw new Error("FIRMS rejected MAP_KEY or returned an error body");
    }
    const rows = parseCsv(text);
    const hotspots: Hotspot[] = rows
      .map((row, index) => {
        const lat = Number(row.latitude);
        const lon = Number(row.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const date = row.acq_date || "1970-01-01";
        const time = (row.acq_time || "0000").padStart(4, "0");
        const observedAt = `${date}T${time.slice(0, 2)}:${time.slice(2, 4)}:00.000Z`;
        const hotspot: Hotspot = {
          eventId: hotspotEventId(lat, lon, `${date}${time}`, index),
          schemaVersion: SCHEMA_VERSION,
          lat,
          lon,
          brightnessK: Number(row.bright_ti4 || row.brightness || 0),
          confidence: mapConfidence(row.confidence),
          frpMw: Number(row.frp) || undefined,
          observedAt,
          satellite: row.satellite || undefined,
          source: "NASA_FIRMS",
        };
        return hotspot;
      })
      .filter((h): h is Hotspot => h !== null)
      .slice(0, MAX_FIRMS_HOTSPOTS);

    if (hotspots.length === 0) {
      return {
        hotspots: fixture,
        usedFixture: true,
        health: {
          id: "firms",
          label: "NASA FIRMS",
          status: "degraded",
          detail: "Live FIRMS returned 0 rows — using fixture",
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
        status: "ok",
        detail: `Live ${product} · ${hotspots.length} detections`,
        lastSuccessAt: now,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown FIRMS error";
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
