import type { AgentOutput, Hotspot, IncidentEvent, WindTick } from "@/lib/schema";
import type { BBox } from "@/lib/ingest/types";
import { agentIsSim } from "@/lib/ui/status";

/** Legend toggle — 4th layer. Never label this cone Live. */
export const PREDICTED_LAYER_LABEL = "Predicted";

/** Popup title. Exact judge-facing string. */
export const PREDICTED_SPREAD_POPUP = "Predicted spread · agent";

export const PREDICTED_FILL = "#FF4D2E";
/** ~18% — flat fill, no glow. */
export const PREDICTED_FILL_OPACITY = 0.18;
export const PREDICTED_STROKE_PX = 1.5;
export const PREDICTED_DASH = "6 5";

/**
 * Single-linkage distance in bbox-normalized space.
 * Intra-cluster gaps in the demo fixture sit under this; inter-cluster gaps sit over it.
 * Normalization keeps the same clusters after El Salvador ↔ Cascade remap.
 */
export const CLUSTER_LINK_DISTANCE = 0.12;

/** Downwind reach as a fraction of the region's shorter side. */
const SPREAD_LENGTH_FRACTION = 0.28;
const SPREAD_HALF_ANGLE_DEG = 18;
const SPREAD_ARC_STEPS = 8;

export type HotspotCluster = {
  hotspots: Hotspot[];
  centroid: { lat: number; lon: number };
  peakFrp: number;
};

export type PredictedSpreadFeature = {
  type: "Feature";
  properties: {
    label: typeof PREDICTED_SPREAD_POPUP;
    layer: typeof PREDICTED_LAYER_LABEL;
    agentId: "fire-propagation";
    fill: typeof PREDICTED_FILL;
    fillOpacity: typeof PREDICTED_FILL_OPACITY;
    stroke: typeof PREDICTED_FILL;
    strokeWidthPx: typeof PREDICTED_STROKE_PX;
    dashed: true;
    /** Always false — this polygon is a prediction, never a satellite product. */
    satellite: false;
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
};

export type PredictedSpreadCollection = {
  type: "FeatureCollection";
  features: PredictedSpreadFeature[];
};

function normalize(
  lat: number,
  lon: number,
  bbox: BBox,
): { x: number; y: number } {
  const [west, south, east, north] = bbox;
  const dx = east - west || 1;
  const dy = north - south || 1;
  return { x: (lon - west) / dx, y: (lat - south) / dy };
}

function peakFrp(hotspot: Hotspot): number {
  return hotspot.frpMw ?? hotspot.brightnessK;
}

/**
 * Group hotspots into theater clusters. Distance is bbox-normalized so a
 * region switch remaps the same groups instead of collapsing them.
 */
export function clusterHotspots(
  hotspots: readonly Hotspot[],
  bbox: BBox,
): HotspotCluster[] {
  const n = hotspots.length;
  if (n === 0) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let cursor = i;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]!]!;
      cursor = parent[cursor]!;
    }
    return cursor;
  };
  const unite = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  };
  const norms = hotspots.map((h) => normalize(h.lat, h.lon, bbox));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = norms[i]!.x - norms[j]!.x;
      const dy = norms[i]!.y - norms[j]!.y;
      if (Math.hypot(dx, dy) <= CLUSTER_LINK_DISTANCE) unite(i, j);
    }
  }
  const groups = new Map<number, Hotspot[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(hotspots[i]!);
    else groups.set(root, [hotspots[i]!]);
  }
  const clusters: HotspotCluster[] = [];
  for (const members of groups.values()) {
    const lat = members.reduce((sum, h) => sum + h.lat, 0) / members.length;
    const lon = members.reduce((sum, h) => sum + h.lon, 0) / members.length;
    clusters.push({
      hotspots: members,
      centroid: { lat, lon },
      peakFrp: Math.max(...members.map(peakFrp)),
    });
  }
  clusters.sort((a, b) => b.peakFrp - a.peakFrp || b.hotspots.length - a.hotspots.length);
  return clusters;
}

/** Highest-FRP cluster — the cone is tied to this, not the map center. */
export function primaryHotspotCluster(
  hotspots: readonly Hotspot[],
  bbox: BBox,
): HotspotCluster | null {
  return clusterHotspots(hotspots, bbox)[0] ?? null;
}

function meanDownwindBearing(wind: readonly WindTick[]): number {
  if (wind.length === 0) return 62;
  let x = 0;
  let y = 0;
  for (const tick of wind) {
    const to = (((tick.directionDeg + 180) % 360) * Math.PI) / 180;
    const weight = Math.max(tick.speedMps, 0.5);
    x += Math.sin(to) * weight;
    y += Math.cos(to) * weight;
  }
  if (x === 0 && y === 0) return 62;
  return (Math.atan2(x, y) * 180) / Math.PI;
}

function destination(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceKm: number,
): { lat: number; lon: number } {
  const earthKm = 6371;
  const δ = distanceKm / earthKm;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return { lat: (φ2 * 180) / Math.PI, lon: (λ2 * 180) / Math.PI };
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function windForCluster(
  wind: readonly WindTick[],
  centroid: { lat: number; lon: number },
  bbox: BBox,
): WindTick[] {
  const origin = normalize(centroid.lat, centroid.lon, bbox);
  const near = wind.filter((tick) => {
    const point = normalize(tick.lat, tick.lon, bbox);
    return Math.hypot(point.x - origin.x, point.y - origin.y) <= 0.28;
  });
  return near.length > 0 ? near : [...wind];
}

function spreadLengthKm(bbox: BBox, lat: number): number {
  const [west, south, east, north] = bbox;
  const latKm = Math.abs(north - south) * 110.574;
  const lonKm =
    Math.abs(east - west) * 111.32 * Math.cos((lat * Math.PI) / 180);
  const shorter = Math.min(latKm, lonKm);
  return Math.max(4, shorter * SPREAD_LENGTH_FRACTION);
}

/**
 * One GeoJSON polygon: a downwind sector from the primary hotspot cluster.
 * Deterministic SIM geometry — drawn even when the propagation agent is on
 * fixture runtime. Coordinates follow the incident's already-remapped points.
 */
export function predictedSpreadGeoJson(
  incident: Pick<IncidentEvent, "hotspots" | "wind" | "region">,
): PredictedSpreadCollection {
  const cluster = primaryHotspotCluster(incident.hotspots, incident.region.bbox);
  if (!cluster) return { type: "FeatureCollection", features: [] };

  const bearing = ((meanDownwindBearing(
    windForCluster(incident.wind, cluster.centroid, incident.region.bbox),
  ) % 360) + 360) % 360;
  const lengthKm = spreadLengthKm(incident.region.bbox, cluster.centroid.lat);
  const apex = destination(
    cluster.centroid.lat,
    cluster.centroid.lon,
    bearing + 180,
    lengthKm * 0.08,
  );
  const ring: number[][] = [[round5(apex.lon), round5(apex.lat)]];
  for (let step = 0; step <= SPREAD_ARC_STEPS; step++) {
    const offset = -SPREAD_HALF_ANGLE_DEG + (2 * SPREAD_HALF_ANGLE_DEG * step) / SPREAD_ARC_STEPS;
    const point = destination(apex.lat, apex.lon, bearing + offset, lengthKm);
    ring.push([round5(point.lon), round5(point.lat)]);
  }
  ring.push([round5(apex.lon), round5(apex.lat)]);

  const feature: PredictedSpreadFeature = {
    type: "Feature",
    properties: {
      label: PREDICTED_SPREAD_POPUP,
      layer: PREDICTED_LAYER_LABEL,
      agentId: "fire-propagation",
      fill: PREDICTED_FILL,
      fillOpacity: PREDICTED_FILL_OPACITY,
      stroke: PREDICTED_FILL,
      strokeWidthPx: PREDICTED_STROKE_PX,
      dashed: true,
      satellite: false,
    },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
  return { type: "FeatureCollection", features: [feature] };
}

export function propagationConeIsSim(
  incident: Pick<IncidentEvent, "agents">,
): boolean {
  const agent = incident.agents.find(
    (row): row is AgentOutput => row.agentId === "fire-propagation",
  );
  if (!agent) return true;
  return agentIsSim(agent);
}

/** Popup copy. The title is always the Predicted label — never a live claim. */
export function predictedSpreadPopupHtml(sim: boolean): string {
  const simLine = sim
    ? `<div style="color:#FFB020">SIM · predicted, not satellite</div>`
    : "";
  return `<div style="font-family:ui-monospace,monospace">
            ${simLine}
            <div style="color:${PREDICTED_FILL}">${PREDICTED_SPREAD_POPUP}</div>
            <div style="opacity:.7">6h envelope · fire-propagation</div>
          </div>`;
}
