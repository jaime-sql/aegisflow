import type { DispatchAction } from "@/lib/schema";

/**
 * Keep the first occurrence of an actionId. Later copies gain a distinguishing
 * suffix so Dispatch never renders two rows with the same id.
 * Preference: agent id, then eventId, then the recommendation index.
 */
export function claimUniqueActionId(
  actionId: string,
  seen: Set<string>,
  suffixes: readonly string[],
): string {
  const base = actionId.trim() || "action";
  if (!seen.has(base)) {
    seen.add(base);
    return base;
  }
  for (const suffix of suffixes) {
    const clean = suffix.trim();
    if (!clean) continue;
    const candidate = `${base}:${clean}`;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      return candidate;
    }
  }
  let n = 2;
  let candidate = `${base}:${n}`;
  while (seen.has(candidate)) {
    n += 1;
    candidate = `${base}:${n}`;
  }
  seen.add(candidate);
  return candidate;
}

export function withUniqueActionIds(
  recommendations: DispatchAction[],
  scope: { agentId?: string; eventId?: string } = {},
): DispatchAction[] {
  const seen = new Set<string>();
  return recommendations.map((action, index) => {
    // Include the index on within-payload copies so `:agentId` stays free for
    // the cross-agent pass (that one suffixes the first repeated id).
    const actionId = claimUniqueActionId(action.actionId, seen, [
      scope.agentId ? `${scope.agentId}:${index}` : "",
      scope.eventId ? `${scope.eventId}:${index}` : "",
      String(index),
    ]);
    return actionId === action.actionId ? action : { ...action, actionId };
  });
}
