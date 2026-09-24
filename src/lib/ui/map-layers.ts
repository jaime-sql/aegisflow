import type { AgentOutput, IncidentEvent } from "@/lib/schema";
import { predictedSpreadGeoJson } from "@/lib/ui/spread-cone";
import { agentIsSim, agentShortName } from "@/lib/ui/status";

export const MAP_LAYER_KEYS = ["hotspots", "wind", "agents", "predicted"] as const;
export type MapLayerKey = (typeof MAP_LAYER_KEYS)[number];

export const MAP_LAYER_LABELS: Record<MapLayerKey, string> = {
  hotspots: "Hotspots",
  wind: "Wind",
  agents: "Agents",
  predicted: "Predicted",
};

export type MapLayerCounts = Record<MapLayerKey, number>;
export type MapLayerVisibility = Record<MapLayerKey, boolean>;

export const DEFAULT_LAYER_VISIBILITY: MapLayerVisibility = {
  hotspots: true,
  wind: true,
  agents: true,
  predicted: true,
};

/**
 * Live counts for the legend toggles. Must equal the features drawn on each
 * named layer (one marker per hotspot / wind tick / agent, one polygon per
 * predicted spread cone).
 */
export function mapLayerCounts(
  incident: Pick<IncidentEvent, "hotspots" | "wind" | "agents" | "region">,
): MapLayerCounts {
  return {
    hotspots: incident.hotspots.length,
    wind: incident.wind.length,
    agents: incident.agents.length,
    predicted: predictedSpreadGeoJson(incident).features.length,
  };
}

function lineageMappedPoints(
  agent: Pick<AgentOutput, "lineage">,
  incident: Pick<IncidentEvent, "hotspots" | "wind">,
): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  for (const row of agent.lineage) {
    const hotspot = incident.hotspots.find((h) => h.eventId === row.eventId);
    if (hotspot) {
      points.push({ lat: hotspot.lat, lon: hotspot.lon });
      continue;
    }
    const wind = incident.wind.find((w) => w.eventId === row.eventId);
    if (wind) points.push({ lat: wind.lat, lon: wind.lon });
  }
  return points;
}

function fallbackAnchor(
  incident: Pick<IncidentEvent, "hotspots" | "wind" | "region">,
): { lat: number; lon: number } {
  const pt = incident.hotspots[0] ?? incident.wind[0];
  if (pt) return { lat: pt.lat, lon: pt.lon };
  return { lat: incident.region.center.lat, lon: incident.region.center.lon };
}

/**
 * Place an agent marker on a real hotspot/wind already on the incident.
 * Each agent picks a different lineage point so the three diamonds stay
 * distinct without inventing coordinates.
 */
export function agentMapAnchor(
  agent: Pick<AgentOutput, "agentId" | "lineage">,
  incident: Pick<IncidentEvent, "hotspots" | "wind" | "region">,
): { lat: number; lon: number } {
  const points = lineageMappedPoints(agent, incident);
  if (points.length === 0) return fallbackAnchor(incident);
  if (agent.agentId === "evacuation") {
    return points[1] ?? points[0];
  }
  if (agent.agentId === "resource-allocation") {
    return points.at(-1) ?? points[0];
  }
  return points[0];
}

export function agentMarkerLetter(
  agentId: AgentOutput["agentId"],
): "P" | "E" | "R" {
  if (agentId === "fire-propagation") return "P";
  if (agentId === "evacuation") return "E";
  return "R";
}

export function agentPopupHtml(agent: AgentOutput): string {
  const sim = agentIsSim(agent)
    ? `<div style="color:#3DB9FF">SIM · fixture agent</div>`
    : "";
  return `<div style="font-family:ui-monospace,monospace">
            ${sim}
            <div>${agentShortName(agent.agentId)}</div>
            <div>conf ${agent.confidence.toFixed(2)}</div>
            <div style="opacity:.7">${agent.eventId}</div>
          </div>`;
}
