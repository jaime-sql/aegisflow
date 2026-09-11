# AegisFlow

**IEEE Response Quest Challenge — submission #5395** (Impact Challenge Product, wildfire / WUI).  
Real-time multi-agent data fusion for wildfire situational awareness.

Stage 1 is a working Next.js Ops foundation: one map-first dashboard, shared event IDs, thin FIRMS + mock wind adapters, three agent stubs, and Clerk RBAC (or a flagged DEV bypass). Architecture approved by Jaime (2026-09-10).

## Problem

Emergency managers drown in siloed feeds (satellite, weather, drones, cams, citizen reports) while fire moves in minutes. AegisFlow fuses those streams and runs specialized agents that produce a single-pane map, executive summary, and prescriptive dispatch — with lineage plus PII scrubbing so recommendations are accountable.

## Architecture (locked)

| Layer | Stage 1 |
| --- | --- |
| Auth | **Clerk** — Emergency Manager vs Viewer. Viewer **sees** dispatch actions locked, not hidden. |
| Ingest | NASA **FIRMS** hotspots (live or fixture) + **mock wind**. One feed can fail without blanking Ops. |
| Agents | Fire propagation · Evacuation logistics · Resource allocation. OpenAI primary / DeepSeek backup **stubs**. |
| Runtime | **Modal-ready** worker stub (`workers/modal_stub.py`); runs locally for the demo. |
| UI | **One** Next.js Ops dashboard (dark ops). Map ~60–70% width. No Replit second map. No live Fabric map. |
| IDs | Shared `eventId` + `schemaVersion` for Ops **and** a future Fabric twin. See [`docs/event-schema.md`](docs/event-schema.md). |
| RF / mesh | Labeled **SIM** only. No live RF. |

Demo region is a **Cascade Range / Sisters / Hwy 20 placeholder** until Jaime picks the contest narrative.

### Notion

- [Project hub](https://app.notion.com/p/3d5825c9c7b7816aa059d4795175d7fb)
- [Architecture](https://app.notion.com/p/3d5825c9c7b78104a395c1b4bb1fb960)
- [First steps & build plan](https://app.notion.com/p/3d5825c9c7b7813d90a7fa489e2e2352)
- [Credits & capability map](https://app.notion.com/p/3d5825c9c7b78129b95ce8133bf0c897)

## How to run (QA smoke)

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Empty Clerk keys enable the DEV bypass so the dashboard still loads.

```bash
npm run build
npm test
python3 workers/modal_stub.py
```

Without API keys, Ops loads the **AegisFire-01** fixture (map, exec summary, lineage chips, dispatch, resource bars, timeline).

| Check | URL |
| --- | --- |
| Ops dashboard | http://localhost:3000 |
| Viewer (bypass) | http://localhost:3000/?role=viewer |
| Fabric stub (same IDs, no map) | http://localhost:3000/fabric |
| Incident JSON | http://localhost:3000/api/ops/incident |

## Clerk roles

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com) and copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` plus `CLERK_SECRET_KEY` into `.env.local`.
2. Open the user in Clerk → **Public metadata** → set:

```json
{ "role": "manager" }
```

or `{ "role": "viewer" }`. Any other or missing value is treated as **viewer**.

3. Sign-in / sign-up routes are `/sign-in` and `/sign-up`.

### DEV bypass (non-prod)

If Clerk keys are missing, middleware does not protect routes and a **DEV BYPASS · NON-PROD** banner is shown. Default bypass role is `manager`. Override with `AEGISFLOW_DEV_ROLE=viewer` or `/?role=viewer`. Use this for local QA only — not for a judged production deploy.

## Environment

See [`.env.example`](.env.example). Secrets are gitignored.

| Variable | Purpose |
| --- | --- |
| `CLERK_*` / `NEXT_PUBLIC_CLERK_*` | Auth. Empty → DEV bypass. |
| `FIRMS_MAP_KEY` | NASA FIRMS area API. Empty → fixture hotspots. |
| `OPENAI_API_KEY` / `DEEPSEEK_*` | Reserved for Stage 2 live LLM. Stage 1 agents return fixtures. |
| `MODAL_ENDPOINT` | Reserved. Empty → `runtime: "local"` on agent outputs. |
| `AEGISFLOW_LIVE_LLM` | Must be `true` before any live LLM path is used (still a stub in Stage 1). |

## Repo layout

```
src/app/                 Ops App Router pages + /fabric stub + /api/ops/incident
src/components/ops/      Top bar, MapLibre map, right rail
src/lib/schema/          Zod + JSON Schema + eventId helpers
src/lib/ingest/          firms.ts · wind.ts
src/lib/agents/          three stubs + OpenAI/DeepSeek/Modal runtime
src/lib/pii.ts           crowdsource scrubber
fixtures/aegisfire-01.json
docs/event-schema.md
workers/modal_stub.py
```

## IEEE originality

AegisFlow is an original IEEE Response Quest submission (#5395). Sample FIRMS, wind, and agent payloads are synthetic fixtures for the Cascade Range placeholder.

## Secrets

Do not commit Clerk, FIRMS, OpenAI, DeepSeek, or Modal keys. `.env.local` stays on the machine.
