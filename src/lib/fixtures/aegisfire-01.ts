import type { IncidentEvent } from "@/lib/schema";
import { parseIncidentEvent } from "@/lib/schema";
import fixture from "../../../fixtures/aegisfire-01.json";

export const SAMPLE_INCIDENT_ID = "AegisFire-01";

export function loadFixtureIncident(): IncidentEvent {
  return parseIncidentEvent(fixture);
}

export function cloneFixtureIncident(): IncidentEvent {
  return parseIncidentEvent(structuredClone(fixture));
}
