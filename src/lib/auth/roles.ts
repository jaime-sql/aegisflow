export type OpsRole = "manager" | "viewer";

export function parseOpsRole(value: unknown): OpsRole {
  return value === "manager" ? "manager" : "viewer";
}

export function canDispatch(role: OpsRole): boolean {
  return role === "manager";
}

/** Manager-only ElevenLabs Brief aloud. Viewer never sees or triggers TTS. */
export function canSpeakBrief(role: OpsRole): boolean {
  return role === "manager";
}
