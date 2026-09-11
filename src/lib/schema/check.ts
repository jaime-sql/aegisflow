import { collectEventIds, parseIncidentEvent } from "./zod";
import fixture from "../../../fixtures/aegisfire-01.json";
import { SAMPLE_CROWD_REPORT, PUBLIC_CROWD_COPY, scrubPii } from "../pii";

function main() {
  const parsed = parseIncidentEvent(fixture);
  const ids = collectEventIds(parsed);
  const unique = new Set(ids);

  if (parsed.eventId !== "evt_aegisfire01_incident") {
    throw new Error(`Unexpected incident eventId: ${parsed.eventId}`);
  }
  if (parsed.incidentId !== "AegisFire-01") {
    throw new Error(`Unexpected incidentId: ${parsed.incidentId}`);
  }
  if (parsed.schemaVersion !== "1.0.0") {
    throw new Error(`Unexpected schemaVersion: ${parsed.schemaVersion}`);
  }

  const owned = [
    parsed.eventId,
    parsed.feedHealth.eventId,
    ...parsed.hotspots.map((h) => h.eventId),
    ...parsed.wind.map((w) => w.eventId),
    ...parsed.agents.map((a) => a.eventId),
    ...parsed.timeline.map((t) => t.eventId),
  ];
  if (new Set(owned).size !== owned.length) {
    throw new Error("Owned eventIds are not unique");
  }
  if (parsed.agents.some((a) => a.confidence < 0.5 || !a.outputHash)) {
    throw new Error("Agents missing confidence or outputHash");
  }

  const scrub = scrubPii(SAMPLE_CROWD_REPORT);
  if (scrub.redactions < 3 || /Maria|Elm Street|541-555|example.com/i.test(scrub.scrubbed)) {
    throw new Error(`PII scrub failed: ${scrub.scrubbed}`);
  }
  if (/Maria|541-555|example.com/i.test(PUBLIC_CROWD_COPY)) {
    throw new Error("Public crowd copy still contains PII");
  }

  console.log(
    `OK  incident=${parsed.incidentId} eventId=${parsed.eventId} schemaVersion=${parsed.schemaVersion} refs=${unique.size} hotspots=${parsed.hotspots.length} wind=${parsed.wind.length} agents=${parsed.agents.length} piiRedactions=${scrub.redactions}`,
  );
}

main();
