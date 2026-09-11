# Ops ↔ Fabric shared event schema

AegisFlow Stage 1 defines a **single event envelope** so the Next.js Ops dashboard and the future Fabric digital twin can talk about the same incident without a second map or a parallel ID space.

Canonical types live in [`src/lib/schema/zod.ts`](../src/lib/schema/zod.ts). JSON Schema is exported from [`src/lib/schema/json-schema.ts`](../src/lib/schema/json-schema.ts). Validate the sample with `npm test`.

## Stable identifiers

| Field | Role |
| --- | --- |
| `eventId` | **Primary join key.** Format `evt_<incidentToken>_<kind>_<n>`. Never recycled. Ops panels, timeline rows, agent lineage, and Fabric stubs all render this string. |
| `schemaVersion` | Currently `1.0.0`. Both surfaces must reject or migrate unknown versions. |
| `incidentId` | Human incident name, e.g. `AegisFire-01`. Many events share one incident. |

Sample envelope for this repo:

```
eventId:      evt_aegisfire01_incident
incidentId:   AegisFire-01
schemaVersion: 1.0.0
```

Hotspots, wind ticks, agent outputs, feed-health snapshots, and timeline items each have their **own** `eventId`. Agent lineage arrays point at those IDs (FIRMS hotspot events, wind ticks, SOP notes) so a judge can walk a recommendation back to evidence.

## Record types

- **IncidentEvent** — fused snapshot the Ops shell loads.
- **Hotspot** — NASA FIRMS (live or fixture) thermal detection.
- **WindTick** — mock / IoT wind vector at a point.
- **AgentOutput** — one of `fire-propagation` · `evacuation` · `resource-allocation`, with `confidence`, `outputHash`, `lineage[]` and model router metadata (`openai` primary, `deepseek` backup, `fixture` in Stage 1).
- **FeedHealth** — per-adapter `ok` / `degraded` / `down` so one failed ingest does not blank the board.

## Fabric twin

Stage 1 does **not** ship a live Fabric map (no Replit second map). `/fabric` is a stub page that lists the same `eventId`s. When the twin is built, it must subscribe to this schema rather than minting new IDs.

## RF / edge mesh

Any RF or mesh row is labeled **SIM**. There is no live RF capture in this repository.

## Versioning

1. Additive optional fields may land in a `1.0.x` patch.
2. Breaking renames require `schemaVersion` bump and a note here plus the Notion architecture page.
