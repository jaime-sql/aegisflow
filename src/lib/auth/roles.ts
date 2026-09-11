export type OpsRole = "manager" | "viewer";

export function parseOpsRole(value: unknown): OpsRole {
  return value === "manager" ? "manager" : "viewer";
}

export function canDispatch(role: OpsRole): boolean {
  return role === "manager";
}
