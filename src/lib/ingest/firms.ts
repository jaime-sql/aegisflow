import type { FeedComponent, Hotspot } from "@/lib/schema";
import { SCHEMA_VERSION } from "@/lib/schema";
import { loadFixtureIncident } from "@/lib/fixtures/aegisfire-01";

export type FirmsResult = {
  hotspots: Hotspot[];
  health: FeedComponent;
  usedFixture: boolean;
};

type BBox = [number, number, number, number];

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

/**
 * NASA FIRMS area CSV. Falls back to AegisFire-01 fixture when FIRMS_MAP_KEY
 * is missing or the request fails (graceful degrade).
 * Docs: https://firms.modaps.eosdis.nasa.gov/api/area/
 */
export async function fetchFirmsHotspots(bbox: BBox): Promise<FirmsResult> {
  const now = new Date().toISOString();
  const key = process.env.FIRMS_MAP_KEY?.trim();
  const fixture = loadFixtureIncident();

  if (!key) {
    return {
      hotspots: fixture.hotspots,
      usedFixture: true,
      health: {
        id: "firms",
        label: "NASA FIRMS",
        status: "ok",
        detail: "Fixture VIIRS hotspots (no FIRMS_MAP_KEY)",
        lastSuccessAt: fixture.hotspots[0]?.observedAt ?? now,
      },
    };
  }

  const product = process.env.FIRMS_PRODUCT?.trim() || "VIIRS_SNPP_NRT";
  const [west, south, east, north] = bbox;
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${product}/${west},${south},${east},${north}/1`;

  try {
    const res = await fetch(url, { cache: "no-store" });
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
      .slice(0, 40);

    if (hotspots.length === 0) {
      return {
        hotspots: fixture.hotspots,
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
      hotspots: fixture.hotspots.map((h) => ({ ...h, degraded: true })),
      usedFixture: true,
      health: {
        id: "firms",
        label: "NASA FIRMS",
        status: "degraded",
        detail: `Live pull failed (${message}) — fixture in use`,
        lastSuccessAt: fixture.hotspots[0]?.observedAt ?? null,
      },
    };
  }
}
