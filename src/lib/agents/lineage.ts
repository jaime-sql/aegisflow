import type { LineageSource } from "@/lib/schema";
import { PUBLIC_CROWD_COPY } from "@/lib/pii";
import { agentEventId, crowdEventId, sopEventId } from "./ids";
import type { AgentId, AgentRunInput } from "./types";

function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}${ns} ${Math.abs(lon).toFixed(4)}${ew}`;
}

function topHotspots(input: AgentRunInput, n: number) {
  return [...input.hotspots]
    .sort((a, b) => (b.frpMw ?? b.brightnessK) - (a.frpMw ?? a.brightnessK))
    .slice(0, n);
}

function topWind(input: AgentRunInput, n: number) {
  return [...input.wind].sort((a, b) => b.speedMps - a.speedMps).slice(0, n);
}

/**
 * Lineage cites the same hotspot/wind eventIds currently on the incident map.
 * SOP / crowd rows are stable stubs (RAG pack), not a second ID space.
 */
export function buildLineage(agentId: AgentId, input: AgentRunInput): LineageSource[] {
  const hotspots = topHotspots(input, agentId === "evacuation" ? 2 : 3);
  const wind = topWind(input, 2);
  const rows: LineageSource[] = [];

  for (const h of hotspots) {
    const frp = h.frpMw != null ? ` FRP ${h.frpMw.toFixed(0)} MW` : "";
    const src = h.source === "NASA_FIRMS" ? "FIRMS live" : "FIRMS fixture";
    rows.push({
      eventId: h.eventId,
      kind: "hotspot",
      label: `${src} ${formatLatLon(h.lat, h.lon)}${frp}`,
    });
  }

  for (const w of wind) {
    const src = w.source === "WEATHERNEXT" ? "WeatherNext 10m" : "Wind fixture";
    rows.push({
      eventId: w.eventId,
      kind: "wind",
      label: `${src} ${w.speedMps.toFixed(1)} m/s from ${Math.round(w.directionDeg)}° · Experimental`,
    });
  }

  if (agentId === "fire-propagation") {
    rows.push({
      eventId: sopEventId(input.incidentId, "nwcg_spread"),
      kind: "sop",
      label: "NWCG spread / spotting guidance (RAG pack stub)",
    });
  } else if (agentId === "evacuation") {
    rows.push({
      eventId: crowdEventId(input.incidentId),
      kind: "crowd",
      label: PUBLIC_CROWD_COPY,
    });
    rows.push({
      eventId: sopEventId(input.incidentId, "evac"),
      kind: "sop",
      label: "County evac SOP (RAG pack stub)",
    });
  } else {
    rows.push({
      eventId: agentEventId(input.incidentId, "fire-propagation"),
      kind: "feed",
      label: "Propagation envelope",
    });
    rows.push({
      eventId: agentEventId(input.incidentId, "evacuation"),
      kind: "feed",
      label: "Egress plan",
    });
    if (rows.filter((r) => r.kind === "wind").length === 0 && wind[0]) {
      rows.push({
        eventId: wind[0].eventId,
        kind: "wind",
        label: `Wind ${wind[0].speedMps.toFixed(1)} m/s · Experimental`,
      });
    }
  }

  const seen = new Set<string>();
  const unique = rows.filter((row) => {
    if (seen.has(row.eventId)) return false;
    seen.add(row.eventId);
    return true;
  });

  if (unique.length === 0) {
    unique.push({
      eventId: sopEventId(input.incidentId, "grounding"),
      kind: "sop",
      label: "No hotspot/wind rows — SOP grounding only",
    });
  }

  return unique;
}

export function compactEvidence(input: AgentRunInput) {
  return {
    hotspots: topHotspots(input, 8).map((h) => ({
      eventId: h.eventId,
      lat: h.lat,
      lon: h.lon,
      brightnessK: h.brightnessK,
      frpMw: h.frpMw,
      confidence: h.confidence,
      source: h.source,
      observedAt: h.observedAt,
    })),
    wind: topWind(input, 6).map((w) => ({
      eventId: w.eventId,
      lat: w.lat,
      lon: w.lon,
      speedMps: w.speedMps,
      directionDeg: w.directionDeg,
      gustMps: w.gustMps,
      source: w.source,
      observedAt: w.observedAt,
    })),
  };
}
