export type OpsRole = "manager" | "viewer";

export function parseOpsRole(value: unknown): OpsRole {
  return value === "manager" ? "manager" : "viewer";
}

export function canDispatch(role: OpsRole): boolean {
  return role === "manager";
}

/**
 * Brief aloud play/stop is open to signed-in Ops (Manager and Viewer).
 * Listen-only — dispatch Ack/Assign stays `canDispatch` / Manager-only.
 */
export function canSpeakBrief(role: OpsRole): boolean {
  return role === "manager" || role === "viewer";
}

/**
 * Ask Ops and Speak answer are open to signed-in Ops (Manager and Viewer).
 * Dispatch Ack/Assign stays `canDispatch` / Manager-only.
 */
export function canAskOps(role: OpsRole): boolean {
  return role === "manager" || role === "viewer";
}
