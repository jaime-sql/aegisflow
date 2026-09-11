import type { FeedComponent, FeedHealth } from "@/lib/schema";

export type FeedDisplay = "Live" | "Degraded" | "Offline";

export function feedDisplay(status: FeedComponent["status"]): FeedDisplay {
  if (status === "ok") return "Live";
  if (status === "degraded") return "Degraded";
  return "Offline";
}

export function feedDotClass(status: FeedComponent["status"]): string {
  if (status === "ok") return "bg-[#3DDC97]";
  if (status === "degraded") return "bg-[#FFB020]";
  return "bg-[#FF5C5C]";
}

export function feedTextClass(status: FeedComponent["status"]): string {
  if (status === "ok") return "text-[#3DDC97]";
  if (status === "degraded") return "text-[#FFB020]";
  return "text-[#FF5C5C]";
}

export function isFeedUnhealthy(health: FeedHealth): boolean {
  return health.overall !== "ok";
}

export function agentShortName(agentId: string): string {
  if (agentId === "fire-propagation") return "Propagation";
  if (agentId === "evacuation") return "Evacuation";
  if (agentId === "resource-allocation") return "Resources";
  return agentId;
}
