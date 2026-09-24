import type { BBox, GeoPoint, IngestRegion } from "@/lib/ingest/types";

/**
 * Ops region catalog (Stage 2 region cut).
 *
 * Product lock: El Salvador / WUI is the default FIRMS + WeatherNext bbox
 * and Ops map initial view. Cascade (AegisFire-01) stays selectable from
 * the existing TopBar incident/region control — same map, in-place remap.
 *
 * Bbox convention: [west, south, east, north] (FIRMS area API + WeatherNext
 * ST_GEOGFROMTEXT). Documented in docs/regions.md.
 */
export const REGION_IDS = ["el-salvador", "cascade"] as const;
export type RegionId = (typeof REGION_IDS)[number];

export const DEFAULT_REGION_ID: RegionId = "el-salvador";

export type OpsRegion = IngestRegion & {
  id: RegionId;
  /** TopBar option label. */
  label: string;
  incidentId: string;
  incidentName: string;
  incidentEventId: string;
  name: string;
  placeholder: boolean;
  executiveSummary: string;
  /** Leaflet fitBounds maxZoom so country vs valley views stay readable. */
  maxZoom: number;
};

/** Cascade Range fixture bbox from fixtures/aegisfire-01.json (Sisters / Hwy 20). */
export const CASCADE_BBOX: BBox = [-121.92, 44.12, -121.28, 44.52];
export const CASCADE_CENTER: GeoPoint = { lat: 44.321, lon: -121.548 };

/**
 * El Salvador national WUI + thin transboundary fringe.
 *
 * | Corner | Value | Why |
 * | west   | -90.20 | ~8 km west of Ahuachapán into Guatemala coffee WUI |
 * | south  | 13.10  | Pacific littoral (Acajutla–La Libertad) with margin |
 * | east   | -87.65 | La Unión / Gulf of Fonseca, slight Honduras buffer |
 * | north  | 14.48  | Chalatenango / Citalá pine WUI, Ocotepeque fringe |
 *
 * Span ~2.55° × 1.38° — under the FIRMS area API 10° limit.
 * Center is San Salvador metro (primary WUI population), not bbox centroid.
 */
export const EL_SALVADOR_BBOX: BBox = [-90.2, 13.1, -87.65, 14.48];
export const EL_SALVADOR_CENTER: GeoPoint = { lat: 13.6929, lon: -89.2182 };

export const OPS_REGIONS: Record<RegionId, OpsRegion> = {
  "el-salvador": {
    id: "el-salvador",
    label: "El Salvador / WUI",
    incidentId: "SV-WUI",
    incidentName: "El Salvador / WUI watch",
    incidentEventId: "evt_svwui_incident",
    name: "El Salvador — national WUI (Ahuachapán–La Unión)",
    placeholder: false,
    center: EL_SALVADOR_CENTER,
    bbox: EL_SALVADOR_BBOX,
    maxZoom: 9,
    executiveSummary:
      "El Salvador WUI watch. NASA FIRMS thermal detections and Experimental WeatherNext 10 m wind over the national bbox (Ahuachapán–La Unión, incl. transboundary fringe). Cascade (AegisFire-01) remains selectable from the region control. RF / edge stay SIM.",
  },
  cascade: {
    id: "cascade",
    label: "Cascade (AegisFire-01)",
    incidentId: "AegisFire-01",
    incidentName: "AegisFire-01 · Sisters / Hwy 20 WUI",
    incidentEventId: "evt_aegisfire01_incident",
    name: "Cascade Range — Sisters / Hwy 20 (AegisFire-01)",
    placeholder: true,
    center: CASCADE_CENTER,
    bbox: CASCADE_BBOX,
    maxZoom: 12,
    executiveSummary:
      "Wind-driven timber/WUI fire west of Sisters (Cascade Range mock). VIIRS clusters aligned with WSW flow; predicted 6-hour envelope toward the Hwy 20 corridor. Hold DP-12, keep Hwy 20 eastbound as egress, commit engines + tanker.",
  },
};

export const OPS_REGION_OPTIONS: Array<{ id: RegionId; label: string }> = [
  { id: "el-salvador", label: OPS_REGIONS["el-salvador"].label },
  { id: "cascade", label: OPS_REGIONS.cascade.label },
];

export function isRegionId(value: string | null | undefined): value is RegionId {
  return value === "el-salvador" || value === "cascade";
}

/** Unknown / missing values fall back to the locked default (El Salvador / WUI). */
export function resolveRegionId(raw?: string | null): RegionId {
  const token = raw?.trim().toLowerCase();
  if (isRegionId(token)) return token;
  if (token === "aegisfire-01" || token === "aegisfire01") return "cascade";
  if (token === "sv" || token === "sv-wui" || token === "elsalvador") {
    return "el-salvador";
  }
  return DEFAULT_REGION_ID;
}

export function resolveOpsRegion(raw?: string | null): OpsRegion {
  return OPS_REGIONS[resolveRegionId(raw)];
}

export function bboxEquals(a: BBox, b: BBox, eps = 1e-9): boolean {
  return a.every((n, i) => Math.abs(n - b[i]!) < eps);
}

export function pointInBbox(lat: number, lon: number, bbox: BBox): boolean {
  const [west, south, east, north] = bbox;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

/**
 * Linear remap of a point from one bbox into another, preserving relative
 * cluster shape. Used so AegisFire-01 fixture hotspots/wind land inside the
 * selected region when live keys are missing — never collapsed to center.
 */
export function remapPoint(
  lat: number,
  lon: number,
  from: BBox,
  to: BBox,
): GeoPoint {
  if (bboxEquals(from, to)) return { lat, lon };
  const [fw, fs, fe, fn] = from;
  const [tw, ts, te, tn] = to;
  const dx = fe - fw || 1;
  const dy = fn - fs || 1;
  const x = (lon - fw) / dx;
  const y = (lat - fs) / dy;
  return {
    lat: ts + y * (tn - ts),
    lon: tw + x * (te - tw),
  };
}

export function remapLatLonToBbox<T extends { lat: number; lon: number }>(
  rows: T[],
  bbox: BBox,
  from: BBox = CASCADE_BBOX,
): T[] {
  if (bboxEquals(from, bbox)) return rows;
  return rows.map((row) => {
    const next = remapPoint(row.lat, row.lon, from, bbox);
    return { ...row, lat: next.lat, lon: next.lon };
  });
}
