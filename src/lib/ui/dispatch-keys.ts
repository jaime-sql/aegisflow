export type DispatchKeyInput = {
  action: { actionId: string };
  agentId?: string;
  eventId?: string;
};

/**
 * React key for one Dispatch row. `actionId` alone is not enough: two agents
 * can recommend the same id. Fall back to eventId, then index, if the
 * actionId:agentId pair still collides.
 */
export function dispatchListKeys(items: readonly DispatchKeyInput[]): string[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    const actionId = item.action.actionId.trim() || "action";
    const agentId = item.agentId?.trim() || "";
    const eventId = item.eventId?.trim() || "";
    const scope = agentId || eventId || "dispatch";
    let key = `${actionId}:${scope}`;
    if (seen.has(key) && eventId && eventId !== scope) {
      const withEvent = `${actionId}:${eventId}`;
      if (!seen.has(withEvent)) key = withEvent;
    }
    if (seen.has(key)) key = `${actionId}:${scope}:${index}`;
    while (seen.has(key)) key = `${key}:${index}`;
    seen.add(key);
    return key;
  });
}
