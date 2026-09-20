import type { AgentOutput, IncidentEvent } from "@/lib/schema";
import { agentIsSim, agentShortName } from "@/lib/ui/status";

export const MAP_LAYER_KEYS = ["hotspots", "wind", "agents"] as const;
export type MapLayerKey = (typeof MAP_LAYER_KEYS)[number];

export const MAP_LAYER_LABELS: Record<MapLayerKey, string> = {
  hotspots: "Hotspots",
  wind: "Wind",
  agents: "Agents",
};

export type MapLayerCounts = Record<MapLayerKey, number>;
export type MapLayerVisibility = Record<MapLayerKey, boolean>;

export const DEFAULT_LAYER_VISIBILITY: MapLayerVisibility = {
  hotspots: true,
  wind: true,
  agents: true,
};

/**
 * Live counts for the legend toggles. Must equal the features drawn on each
 * named layer (one marker per hotspot / wind tick / agent).
 */
export function mapLayerCounts(
  incident: Pick<IncidentEvent, "hotspots" | "wind" | "agents">,
): MapLayerCounts {
  return {
    hotspots: incident.hotspots.length,
    wind: incident.wind.length,
    agents: incident.agents.length,
  };
}

const AGENT_NUDGE_RAD_M = 0.006;

/**
 * Place an agent marker on real lineage coordinates (hotspot / wind eventIds
 * already on the incident). A ~600 m cartographic nudge keeps the three
 * diamonds from stacking when they share a centroid — not a fake location.
 */
export function agentMapAnchor(
  agent: Pick<AgentOutput, "agentId" | "lineage">,
  incident: Pick<IncidentEvent, "hotspots" | "wind" | "region">,
): { lat: number; lon: number } {
  const ids = new Set(agent.lineage.map((row) => row.eventId));
  const pts = [
    ...incident.hotspots.filter((h) => ids.has(h.eventId)),
    ...incident.wind.filter((w) => ids.has(w.eventId)),
  ];
  const fallback = incident.hotspots[0] ?? incident.wind[0];
  const base = pts.length
    ? {
        lat: pts.reduce((sum, p) => sum + p.lat, 0) / pts.length,
        lon: pts.reduce((sum, p) => sum + p.lon, 0) / pts.length,
      }
    : fallback
      ? { lat: fallback.lat, lon: fallback.lon }
      : { lat: incident.region.center.lat, lon: incident.region.center.lon };

  const index =
    agent.agentId === "fire-propagation"
      ? 0
      : agent.agentId === "evacuation"
        ? 1
        : 2;
  const angle = (index * 2 * Math.PI) / 3;
  return {
    lat: base.lat + AGENT_NUDGE_RAD_M * Math.cos(angle),
    lon: base.lon + AGENT_NUDGE_RAD_M * Math.sin(angle),
  };
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
