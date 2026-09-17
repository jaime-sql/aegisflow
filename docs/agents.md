# Stage 2 Phase 2 — live agents (Modal + OpenAI / DeepSeek)

Ops already had three **stubs** (`fire-propagation`, `evacuation`, `resource-allocation`) that copied AegisFire-01 fixture text and left `completeWithFailover` empty. This stage wires those same agent IDs to real Modal HTTP + LLM calls **without minting a parallel eventId space**.

Canonical types: [`src/lib/schema/zod.ts`](../src/lib/schema/zod.ts). Worker: [`workers/modal_stub.py`](../workers/modal_stub.py).

## Who owns IDs

The Next.js / OpenNext Worker **assigns** IDs and lineage **before** any LLM call:

| Field | Rule |
| --- | --- |
| Agent `eventId` | `evt_aegisfire01_agent_propagation` (Cascade) or `evt_svwui_agent_propagation` (El Salvador). Same pattern for `_evacuation` / `_resources`. |
| Lineage `eventId` | Copied from the **current** FIRMS hotspot and WeatherNext wind rows on the incident (the same IDs the map plots). SOP / crowd rows stay `evt_<token>_sop_*` / `evt_<token>_crowd_01`. |
| `schemaVersion` | `1.0.0` |

Modal/LLM only fill `summary`, `confidence`, and `recommendations`. If the worker echoes a different `eventId`, Ops **overwrites** it with the pre-assigned value.

## Router

Matches the Stage 1 stub and the schema literals:

1. **Modal** when `MODAL_ENDPOINT` is set (preferred workers).
2. Else **local LLM**: OpenAI primary (`gpt-4o-mini`), DeepSeek backup (`deepseek-chat` at `DEEPSEEK_BASE_URL`, default `https://api.deepseek.com`).
3. Else **fixture** (CI / missing keys).

`AEGISFLOW_LIVE_LLM=false` or `AEGISFLOW_USE_AGENT_FIXTURE=true` forces fixture even if keys exist.

## Honest status (no silent fake confidence)

| Situation | `model.used` | `degraded` | confidence | Feed health |
| --- | --- | --- | --- | --- |
| No keys / no Modal | `fixture` | omitted | fixture values (0.71–0.82) | `ok` — AgentChip shows **Fixture** |
| Live Modal or LLM success | `openai` or `deepseek` | omitted | model value (capped at 0.95) | `ok` — AgentChip shows **Live** |
| Live attempt failed | `fixture` | `true` | **capped at 0.40** | `degraded` — FeedBanner + AgentChip **Degraded** |

Ops never blanks. Manager Ack/Assign still bind to `agent.recommendations[].actionId`.

## What Jaime must set

Never commit these. Copy [`.env.example`](../.env.example) to `.env.local`.

### Local / CI

CI unsets the keys. Tests mock `fetch`. `npm test` must pass without Modal or LLM accounts.

### Live local

```bash
# cheaper backup (optional but recommended)
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com

# primary
OPENAI_API_KEY=

# optional — skip Modal and call OpenAI/DeepSeek from the Next.js process
# MODAL_ENDPOINT=
```

### Modal workers (preferred)

```bash
pip install modal fastapi
modal setup
modal secret create aegisflow-llm OPENAI_API_KEY=sk-... DEEPSEEK_API_KEY=sk-...
modal deploy workers/modal_stub.py
```

Put the printed `run_agent` URL in `MODAL_ENDPOINT`. Create a [proxy token](https://modal.com/docs/guide/webhook-proxy-auth) and set:

```
MODAL_TOKEN_ID=wk-...
MODAL_TOKEN_SECRET=ws-...
```

Ops sends `Modal-Key` / `Modal-Secret` (and `Authorization: Bearer id.secret`).

Local smoke without deploy:

```bash
python3 workers/modal_stub.py
```

### Cloudflare prod (`cortexmatter.com/aegisflow`)

Jaime adds GitHub Actions secrets (agents often **cannot**):

| Secret / var | Where |
| --- | --- |
| `OPENAI_API_KEY` | Actions secret → Wrangler secret on Worker `aegisflow` |
| `DEEPSEEK_API_KEY` | Actions secret → Wrangler secret |
| `MODAL_TOKEN_ID` | Actions secret → Wrangler secret |
| `MODAL_TOKEN_SECRET` | Actions secret → Wrangler secret |
| `MODAL_ENDPOINT` | Actions variable **or** Wrangler var (the `*.modal.run` URL) |
| `DEEPSEEK_BASE_URL` | Wrangler var (already defaulted) |

Empty values keep Ops on the fixture path (same pattern as FIRMS / WeatherNext). After a Cloudflare Prod run, AgentChip should read **Live openai** (or **Live deepseek**) when keys work; otherwise **Fixture** or **Degraded** with a FeedBanner.

Do **not** change Clerk or the Fabric stub in this phase.
