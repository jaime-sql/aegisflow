import type { AgentId } from "./types";

/**
 * Incident token inside `evt_<token>_…`. Keeps Cascade IDs on
 * `evt_aegisfire01_agent_*` and El Salvador on `evt_svwui_agent_*`.
 */
export function incidentToken(incidentId: string): string {
  const raw = incidentId.trim();
  if (raw === "AegisFire-01" || raw === "aegisfire01") return "aegisfire01";
  if (raw === "SV-WUI" || raw === "svwui") return "svwui";
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return slug.slice(0, 24) || "incident";
}

export function agentKindToken(agentId: AgentId): "propagation" | "evacuation" | "resources" {
  if (agentId === "fire-propagation") return "propagation";
  if (agentId === "evacuation") return "evacuation";
  return "resources";
}

export function agentEventId(incidentId: string, agentId: AgentId): string {
  return `evt_${incidentToken(incidentId)}_agent_${agentKindToken(agentId)}`;
}

export function sopEventId(incidentId: string, slug: string): string {
  return `evt_${incidentToken(incidentId)}_sop_${slug}`;
}

export function crowdEventId(incidentId: string): string {
  return `evt_${incidentToken(incidentId)}_crowd_01`;
}

export const AGENT_TITLES: Record<AgentId, string> = {
  "fire-propagation": "Propagation",
  evacuation: "Evacuation",
  "resource-allocation": "Resources",
};
