# AegisFlow

**IEEE Response Quest Challenge — submission #5395** (Impact Challenge Product, wildfire / WUI).  
Real-time multi-agent data fusion for wildfire situational awareness.

Stage 2 Phase 2 wires the three Ops agents to **Modal** workers plus **OpenAI** (primary) / **DeepSeek** (backup), with fixture fallback and honest agent status when keys are missing. Phase 1 is live NASA **FIRMS** hotspots plus **WeatherNext** 10 m wind (BigQuery, labeled **Experimental**) on the same Ops map. Stage 1 still ships Clerk RBAC and shared event IDs. Architecture approved by Jaime (2026-09-10).

## Problem

Emergency managers drown in siloed feeds (satellite, weather, drones, cams, citizen reports) while fire moves in minutes. AegisFlow fuses those streams and runs specialized agents that produce a single-pane map, executive summary, and prescriptive dispatch — with lineage plus PII scrubbing so recommendations are accountable.

## Architecture (locked)

| Layer | Stage 1 |
| --- | --- |
| Auth | **Clerk** — Emergency Manager vs Viewer. Viewer **sees** dispatch actions locked, not hidden. **Brief aloud** is listen-only play/stop for Manager and Viewer. **Ask Ops** and **Speak answer** are also Manager and Viewer. |
| Ingest | NASA **FIRMS** hotspots (live or fixture) + **WeatherNext** 10 m wind (BigQuery, Experimental; fixture fallback). One feed can fail without blanking Ops. |
| Agents | Fire propagation · Evacuation logistics · Resource allocation. **OpenAI** primary / **DeepSeek** backup, hosted on **Modal** when `MODAL_ENDPOINT` is set. Stub fallback marks the existing AgentChip **SIM** (same token as RF / Edge). Live runs only refresh chip confidence + lineage drawer. |
| Runtime | Modal worker (`workers/modal_stub.py`) — `python3 workers/modal_stub.py` locally; `modal deploy` for live HTTP. |
| UI | **One** Next.js Ops dashboard (dark ops). Map ~60–70% width. No Replit second map. No live Fabric map. |
| IDs | Shared `eventId` + `schemaVersion` for Ops **and** a future Fabric twin. See [`docs/event-schema.md`](docs/event-schema.md). |
| RF / mesh | Labeled **SIM** only. No live RF. |

Demo region **defaults to El Salvador / WUI**. Cascade (AegisFire-01) stays selectable from the TopBar region control (same map, in-place remap). Bbox: [`docs/regions.md`](docs/regions.md).

### Notion

- [Project hub](https://app.notion.com/p/3d5825c9c7b7816aa059d4795175d7fb)
- [Architecture](https://app.notion.com/p/3d5825c9c7b78104a395c1b4bb1fb960)
- [Design — Ops UI & judge surfaces](https://app.notion.com/p/3d8825c9c7b7810fa159e2b8094a0cdf)
- [QA — Test bar & judge demo script](https://app.notion.com/p/3d8825c9c7b78155bec5fa727274a80e)
- [First steps & build plan](https://app.notion.com/p/3d5825c9c7b7813d90a7fa489e2e2352)
- [Credits & capability map](https://app.notion.com/p/3d5825c9c7b78129b95ce8133bf0c897)

## How to run (QA smoke)

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000/ops](http://localhost:3000/ops). Empty Clerk keys enable the DEV bypass so the dashboard still loads. Sign-in is `/sign-in` (after auth, Clerk redirects to `/ops`). Local `basePath` is empty; production uses `/aegisflow` (see [Cloudflare production](#cloudflare-production-cortexmattercomaegisflow)).

```bash
npm run build
npm test
python3 workers/modal_stub.py
```

Without API keys, Ops loads the **AegisFire-01** fixture remapped into the **El Salvador / WUI** bbox (map, exec summary, lineage chips, dispatch, resource bars, timeline). Switch the TopBar to Cascade to see native Sisters / Hwy 20 coordinates.

| Check | URL |
| --- | --- |
| Ops dashboard | http://localhost:3000/ops |
| Viewer (bypass) | http://localhost:3000/ops?role=viewer — Brief aloud play/stop; Ask + Speak answer; Ack/Assign locked |
| First-visit tour | Coach marks on `/ops` (5 Design steps for Manager and Viewer; Skip / Don’t show again) |
| Clerk sign-in | http://localhost:3000/sign-in |
| Fabric twin (same IDs, no map) | http://localhost:3000/fabric |
| Incident JSON | http://localhost:3000/api/ops/incident (default El Salvador / WUI) |
| Cascade incident JSON | http://localhost:3000/api/ops/incident?region=cascade |

## Clerk roles

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com) and copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` plus `CLERK_SECRET_KEY` into `.env.local`.
2. Open the user in Clerk → **Public metadata** → set:

```json
{ "role": "manager" }
```

or `{ "role": "viewer" }`. Any other or missing value is treated as **viewer**.

3. Sign-in / sign-up routes are `/sign-in` and `/sign-up` locally, or `/aegisflow/sign-in` and `/aegisflow/sign-up` in production.

### Clerk on `/aegisflow` (production)

`output: "export"` would drop `src/middleware.ts` (`clerkMiddleware` + `auth.protect()`), the `/api/ops/incident` route, and `currentUser()` on the Ops page. This app therefore deploys with **`@opennextjs/cloudflare`** (OpenNext Worker), not Rosario-style static Pages.

In [Clerk Dashboard](https://dashboard.clerk.com) → the AegisFlow application → **Domains / Paths / Redirects**, add:

| Setting | Value |
| --- | --- |
| Home / application URL | `https://cortexmatter.com/aegisflow` |
| Sign-in | `https://cortexmatter.com/aegisflow/sign-in` |
| Sign-up | `https://cortexmatter.com/aegisflow/sign-up` |
| After sign-in | `https://cortexmatter.com/aegisflow/ops` |
| After sign-up | `https://cortexmatter.com/aegisflow/ops` |
| After sign-out | `https://cortexmatter.com/aegisflow/sign-in` |
| Allowed redirect origins | `https://cortexmatter.com`, `https://aegisflow.jaime-8a8.workers.dev` |

The path Worker service-binds to `aegisflow` using the **workers.dev** origin (so Clerk SSR sees a host that already works). The **browser** still loads Clerk JS on `https://cortexmatter.com`, so the Dashboard **must** list that origin. Missing `cortexmatter.com` does not usually HTTP-500 the Worker (that was Error 1019); it breaks the Clerk widget / handshake in the browser.

Do **not** point Clerk at `https://cortexmatter.com/` (apex). That URL is reserved for other apps. Do **not** add `https://aegisflow-path.jaime-8a8.workers.dev` unless you intend to use that hostname in a browser.

The Cloudflare prod workflow inlines `NEXT_PUBLIC_CLERK_*` paths with the `/aegisflow` prefix from `next.config.ts`. The OpenNext Worker also receives those paths as Wrangler `vars`, plus `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` as Worker **secrets**, so middleware can redirect to `/aegisflow/sign-in` at runtime. Local `.env.local` keeps the unprefixed `/sign-in` values.

### DEV bypass (non-prod)

If Clerk keys are missing, middleware does not protect routes and a **DEV BYPASS · NON-PROD** banner is shown. Default bypass role is `manager`. Override with `AEGISFLOW_DEV_ROLE=viewer` or `/ops?role=viewer`. Use this for local QA only — not for a judged production deploy.

## Environment

See [`.env.example`](.env.example). Secrets are gitignored.

| Variable | Purpose |
| --- | --- |
| `CLERK_*` / `NEXT_PUBLIC_CLERK_*` | Auth. Empty → DEV bypass. Prod paths are `/aegisflow/sign-in` etc. |
| `BASE_PATH` / `CLOUDFLARE_PROD` | Prod `basePath` / `assetPrefix` = `/aegisflow`. Unset locally. |
| `AEGISFLOW_ORIGIN` | Path Worker only. Service-bind dest = OpenNext `workers.dev` origin (never the inbound Host). |
| `FIRMS_MAP_KEY` | NASA FIRMS area API. Empty → fixture hotspots remapped into the selected bbox. Wrangler secret on Worker `aegisflow`. |
| `GCP_SA_JSON` | GCP service-account JSON for project `aegisflow-ieee-quest`. Empty → fixture wind. Wrangler secret. |
| `GOOGLE_APPLICATION_CREDENTIALS` / `_JSON` | Local ADC alternative to `GCP_SA_JSON` (file path or JSON). Never commit. |
| `GCP_PROJECT_ID` / `WEATHERNEXT_BQ_DATASET` | BigQuery project (default `aegisflow-ieee-quest`) and Analytics Hub linked dataset (default `weathernext`). |
| `WIND_CACHE` (KV) | Cloudflare KV binding for WeatherNext ticks (`wind:el-salvador`, `wind:cascade`). Cron `*/8 * * * *` refreshes both picker regions with a 90s BigQuery budget. Ops reads cache only. Signed-in `GET /aegisflow/api/ops/wind-cache-refresh` is a one-shot fill. |
| `OPENAI_API_KEY` / `DEEPSEEK_*` | LLM router. **Optional for Cloudflare Prod** — empty/missing GitHub secrets are skipped (wrangler-action fails if they are listed empty). Empty → fixture agents (**SIM**) and Ask Ops on static FAQ. Live: OpenAI `gpt-4o-mini` primary, DeepSeek `deepseek-chat` backup. See [`docs/agents.md`](docs/agents.md) and [`docs/ask-ops.md`](docs/ask-ops.md). |
| `MODAL_ENDPOINT` / `MODAL_TOKEN_*` | Preferred agent host. **Optional for Prod** (same skip-if-empty rule). Empty → local LLM or fixture. Proxy-auth headers sent when tokens are set. |
| `ELEVENLABS_API_KEY` | Manager + Viewer **Brief aloud** (exec summary TTS, listen-only) and **Speak answer** (latest Ask reply only; 20 speaks / browser / UTC day or 15,000 characters). **Optional for Prod.** When the Actions secret is set, Cloudflare Prod uploads it as a Worker secret; when empty, it is skipped and both controls show muted **SIM**. See [`docs/brief-aloud.md`](docs/brief-aloud.md) and [`docs/ask-ops.md`](docs/ask-ops.md). |
| `ELEVENLABS_VOICE_ID` | Optional Worker secret (skip-if-empty). Default premade Rachel `21m00Tcm4TlvDq8ikWAM` comes from `wrangler.jsonc` when the secret is unset (Jaime did not pick a voice). Override via Actions secret / Wrangler / `.env.local`. |
| `AEGISFLOW_LIVE_LLM` | Set `false` to force fixture even if keys exist. |

## Repo layout

```
src/app/                 /ops dashboard + /fabric twin + /sign-in + /api/ops/incident
src/components/ops/      TopBar, MapShell, ExecSummary, AgentChip, Dispatch, lineage drawer
src/lib/schema/          Zod + JSON Schema + eventId helpers
src/lib/base-path.ts     env-driven `/aegisflow` prefix
src/lib/ingest/          firms.ts · wind.ts (cache-first) · wind-cache.ts · weathernext.ts
src/lib/regions.ts       El Salvador / WUI (default) + Cascade catalog
src/lib/agents/          three agents + OpenAI/DeepSeek/Modal runtime (fixture fallback)
src/lib/tts/             ElevenLabs Brief aloud (radio clip + WIND_CACHE `tts:` keys)
src/lib/ask/             Ask Ops text (gpt-4o-mini / deepseek-chat / FAQ) + Speak answer cap
src/lib/pii.ts           crowdsource scrubber
fixtures/aegisfire-01.json
docs/event-schema.md
docs/regions.md
docs/weathernext.md
docs/agents.md
docs/brief-aloud.md
docs/ask-ops.md
cloudflare-worker.ts     OpenNext fetch + WeatherNext KV cron
scripts/ensure-wind-cache-kv.mjs
scripts/select-worker-secrets.mjs  skip empty optional Prod secrets (OpenAI/ElevenLabs/…)
workers/modal_stub.py    local printer + `modal deploy` HTTP worker
workers/aegisflow-path/  Cloudflare path Worker (cortexmatter.com/aegisflow only)
.github/workflows/cloudflare-prod.yml
```

## Cloudflare production (`cortexmatter.com/aegisflow`)

Locked prod URL: **https://cortexmatter.com/aegisflow**. The apex `cortexmatter.com/` stays free for other apps. The path Worker only claims `cortexmatter.com/aegisflow*` and `cortexmatter.com/aegisflow/*`. The prefix (not an exact `/aegisflow` match) is required so Clerk's `?__clerk_handshake` return on the bare path hits this Worker instead of the dummy A record.

Rosario can use static `output: "export"` because it has no middleware. AegisFlow cannot: Clerk `clerkMiddleware`, `auth.protect()`, `currentUser()`, `force-dynamic` Ops/Fabric pages, and `/api/ops/incident` need a Node-compatible Worker. **Adapter choice: `@opennextjs/cloudflare` (OpenNext)** deployed as Worker `aegisflow` (same name as the existing empty Pages project). Preview: `*.workers.dev` (`aegisflow.pages.dev` has **no** deployments and returns 522 — do not use it). Public traffic goes through Worker `aegisflow-path` via the `AEGISFLOW` service binding only. The path Worker **must** call that binding with the OpenNext origin (`AEGISFLOW_ORIGIN=https://aegisflow.jaime-8a8.workers.dev`), not the inbound `https://cortexmatter.com/...` URL. OpenNext SSR fetches `request.url`; if that host routes back to `aegisflow-path`, Cloudflare returns **Error 1019** (Worker self-recursion) as HTTP 503/500. `X-Forwarded-Host` / `X-Forwarded-Proto` preserve the public host; `Location` is still rewritten onto `cortexmatter.com`. `npm run build` is webpack (not Turbopack) so OpenNext can emit a standalone Worker; `npm run dev` still uses Turbopack.

`basePath` / `assetPrefix` become `/aegisflow` when `CLOUDFLARE_PROD=true` or `BASE_PATH=/aegisflow`. Leaflet marker images live under `public/leaflet/` so they load as `/aegisflow/leaflet/...`. Next.js `Link` / `redirect()` already prefix `basePath`; raw URLs use `withBasePath()`.

### Jaime’s post-merge steps

Agents often **cannot** add GitHub Actions secrets (`actions:write` is missing). Jaime must do this in the GitHub UI:

1. **Clerk Dashboard** — add the production URLs in the table above (sign-in, after-sign-in, allowed origins). `https://cortexmatter.com` **and** `https://aegisflow.jaime-8a8.workers.dev` are both required. Do not use the apex as the app home URL.
2. **Cloudflare DNS** — Worker routes only fire when the hostname is proxied. The `cortexmatter.com` zone must have a proxied dummy A record (`192.0.2.1`, orange cloud) so `/aegisflow` reaches `aegisflow-path`. Without it the name is NXDOMAIN. Unmatched apex paths stay Error 1016 until another app adds a real origin.
3. **GitHub → Settings → Secrets and variables → Actions** on [jaime-sql/aegisflow](https://github.com/jaime-sql/aegisflow):
   - `CLOUDFLARE_API_TOKEN` — Pages + Workers edit on account `8a8c9483df8e8a2a9adec437a0994fe4` (same token pattern as Rosario). Confirm this secret exists on **this** repo; it is not inherited from another project.
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - Optional live ingest (otherwise Ops uses the AegisFire-01 fixture and FeedBanner stays quiet):
     - `FIRMS_MAP_KEY` — NASA FIRMS MAP key. Also uploaded as Wrangler secret `FIRMS_MAP_KEY` on Worker `aegisflow`.
     - `GCP_SA_JSON` — service-account JSON for GCP project `aegisflow-ieee-quest` (BigQuery Job User + Data Viewer on the WeatherNext Analytics Hub dataset). Wrangler secret `GCP_SA_JSON`.
   - Optional live agents (otherwise AgentChip shows **SIM** like RF/Edge; Ops stays up). **Not required to deploy.** Empty GitHub secrets are omitted from wrangler-action `secrets:` so Prod does not fail. See [`docs/agents.md`](docs/agents.md):
     - `OPENAI_API_KEY` — primary LLM. Wrangler secret when set; skip when empty.
     - `DEEPSEEK_API_KEY` — cheaper backup LLM. Wrangler secret when set; skip when empty.
     - `MODAL_ENDPOINT` — `*.modal.run` URL from `modal deploy workers/modal_stub.py`. Wrangler secret/var when set.
     - `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` — Modal proxy token. Wrangler secrets when set.
   - Optional **Brief aloud** (exec-summary TTS for Manager and Viewer; empty → muted SIM). **Not required to deploy.** When `ELEVENLABS_API_KEY` is set, Cloudflare Prod uploads it; when empty, Brief aloud stays SIM. See [`docs/brief-aloud.md`](docs/brief-aloud.md):
     - `ELEVENLABS_API_KEY` — Worker secret when set. Expire-first credits; last clip cached per `eventId` in `WIND_CACHE` (`tts:` keys).
     - `ELEVENLABS_VOICE_ID` — optional Worker secret when set. Default Rachel `21m00Tcm4TlvDq8ikWAM` from `wrangler.jsonc` if unset.
   - If the linked BigQuery dataset is not named `weathernext`, set Wrangler var `WEATHERNEXT_BQ_DATASET`. See [`docs/weathernext.md`](docs/weathernext.md).
4. **Actions → Cloudflare Prod → Run workflow** (or push a `prod-*` tag). The workflow runs `npm ci`, `npm test`, `npm run build` with `BASE_PATH=/aegisflow`, OpenNext-adapts the build, **creates/binds KV `WIND_CACHE`** (`scripts/ensure-wind-cache-kv.mjs`), then **uploads only non-empty Worker secrets** (`scripts/select-worker-secrets.mjs` — Clerk is required; `FIRMS_MAP_KEY` / `GCP_SA_JSON` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `MODAL_*` / `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` are skipped when empty so wrangler-action does not fail) and deploys Worker `aegisflow`. Path, WeatherNext dataset, `DEEPSEEK_BASE_URL`, ElevenLabs model/voice default, and cron `*/8 * * * *` come from `wrangler.jsonc`. Then it deploys `workers/aegisflow-path`. **OpenAI is not required to deploy.**
   - If the KV step fails, the API token needs Workers KV edit, or Jaime runs `npx wrangler kv namespace create WIND_CACHE` once and pastes the id into `wrangler.jsonc`. See [`docs/weathernext.md`](docs/weathernext.md).
5. **QA smoke**
   - `https://cortexmatter.com/` is **not** AegisFlow (other apps).
   - `https://cortexmatter.com/aegisflow` → Clerk sign-in (`/aegisflow/sign-in`) or `/aegisflow/ops` after auth. Must **not** be HTTP 500.
   - Signed-out `/aegisflow/ops` → **redirect to sign-in** (not a Clerk 404 `protect-rewrite`).
   - Sign-in / sign-up stay under `/aegisflow/...` and return 200 with the Clerk widget (Dev keys show Clerk’s development banner).
   - UserButton **Sign out** → `/aegisflow/sign-in` (must **not** hang on a spinner or navigate to apex `cortexmatter.com/`).
   - Map tiles + `/aegisflow/_next/...` + `/aegisflow/leaflet/...` load.
   - Viewer vs Manager still works (Clerk `publicMetadata.role`). Viewer **sees Brief aloud** (listen-only play/stop) and locked dispatch; Manager sees Brief aloud plus Ack/Assign (muted **SIM** if `ELEVENLABS_API_KEY` is empty). First-visit Ops coach marks run five Design steps for both roles (Skip / Don’t show again).
   - Fabric twin: `https://cortexmatter.com/aegisflow/fabric`.
   - Direct Worker: `https://aegisflow.jaime-8a8.workers.dev/aegisflow` should behave the same (add this host under Clerk allowed origins).

Do not connect Cloudflare Git auto-deploy to `main` if you want promotion to stay manual (`workflow_dispatch` / `prod-*` tags), matching Rosario.

### Re-run Cloudflare Prod after the path-Worker 1019 fix

After PR #3, `https://aegisflow.jaime-8a8.workers.dev/aegisflow/sign-in` returned **200**, but any request that entered through `aegisflow-path` (custom domain **or** `aegisflow-path.jaime-8a8.workers.dev`) still failed on SSR:

| URL | Live result (2026-09-12) |
| --- | --- |
| `https://aegisflow.jaime-8a8.workers.dev/aegisflow/sign-in` | **200** Clerk chrome |
| `https://aegisflow.jaime-8a8.workers.dev/aegisflow` | **307** → `/aegisflow/sign-in` |
| `https://aegisflow-path.jaime-8a8.workers.dev/aegisflow` | **307** (middleware only) |
| `https://aegisflow-path.jaime-8a8.workers.dev/aegisflow/sign-in` | **503 Error 1019** (Worker self-recursion) |
| `https://cortexmatter.com/aegisflow` | **307** → `/aegisflow/sign-in` (after dummy A record) |
| `https://cortexmatter.com/aegisflow/sign-in` | **503 Error 1019** (same loop as the path Worker hostname) |

Root cause: `aegisflow-path` forwarded `new Request(https://<inbound-host>/aegisflow/...)`. OpenNext SSR with `global_fetch_strictly_public` fetches that URL; the host routes back into `aegisflow-path` → service bind → loop until Cloudflare Error 1019. Middleware redirects do not SSR, so `/` and `/ops` could 307 while `/sign-in` died.

This is **not** Clerk rejecting `Host=cortexmatter.com` on the Worker (workers.dev keys already work). Jaime still needs `https://cortexmatter.com` in Clerk allowed origins for the **browser** widget.

**Jaime re-run**

1. Merge this PR to `main`.
2. Confirm Actions secrets: `CLOUDFLARE_API_TOKEN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
3. Clerk Dashboard → allowed origins / paths in the table above (`cortexmatter.com` **and** `aegisflow.jaime-8a8.workers.dev`).
4. Cloudflare DNS for `cortexmatter.com`: proxied A `@` → `192.0.2.1` if no apex record exists yet.
5. **Actions → Cloudflare Prod → Run workflow** (or push a new `prod-*` tag). The path Worker deploy picks up `AEGISFLOW_ORIGIN`.
6. Smoke in a **real browser**:
   - `https://aegisflow.jaime-8a8.workers.dev/aegisflow/sign-in` still **200** (must not regress).
   - `https://aegisflow-path.jaime-8a8.workers.dev/aegisflow/sign-in` → **200** (no 1019).
   - `https://cortexmatter.com/aegisflow` → sign-in or `/ops` — **not** 500/503.
   - `/aegisflow/sign-in` → 200 + Clerk widget. `/aegisflow/ops` signed-out → redirect to sign-in.

### Re-run Cloudflare Prod after the 500 fix

`24c2c7b` deployed a green Worker that still failed in the browser:

1. **`/aegisflow/sign-in` HTTP 500** — `ClerkGate` mounted `ClerkProvider` only after `useEffect`, so `<SignIn>` SSR’d on OpenNext without Clerk context.
2. **Signed-out `/ops` → 404** — `auth.protect()` did a Clerk `protect-rewrite` (`x-clerk-auth-reason: protect-rewrite, dev-browser-missing`) because middleware had no runtime `signInUrl` / `BASE_PATH`. The home page then 307’d into that 404.

This is **not** a missing R2 cache binding and **not** the path Worker stripping `/aegisflow`. Dev Clerk keys (`pk_test_` / `sk_test_`) are OK for first smoke if the hosts above are allowed; use `pk_live_` / `sk_live_` for the judged demo.

**Jaime re-run**

1. Merge the fix PR to `main`.
2. Confirm Actions secrets: `CLOUDFLARE_API_TOKEN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
3. Clerk Dashboard → add `https://cortexmatter.com` **and** `https://aegisflow.jaime-8a8.workers.dev` as allowed origins (paths in the table above).
4. **Actions → Cloudflare Prod → Run workflow** (or push a new `prod-*` tag). Do not use Cloudflare Git auto-deploy.
5. Smoke `https://cortexmatter.com/aegisflow`, `/aegisflow/sign-in`, and `/aegisflow/ops` in a real browser (Clerk Dev handshake sets a cookie; `curl` will still look signed-out).

## IEEE originality

AegisFlow is an original IEEE Response Quest submission (#5395). Sample FIRMS, wind, and agent payloads are synthetic fixtures (Cascade AegisFire-01), remapped into the El Salvador / WUI bbox when live keys are missing.

## Secrets

Do not commit Clerk, FIRMS, GCP service-account JSON, OpenAI, DeepSeek, Modal, ElevenLabs, or Cloudflare API tokens. `.env.local` and `.dev.vars` stay on the machine. GitHub Actions secrets are the only place `CLOUDFLARE_API_TOKEN` / `CLERK_SECRET_KEY` / `FIRMS_MAP_KEY` / `GCP_SA_JSON` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `MODAL_TOKEN_SECRET` / `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` belong. Agent + ElevenLabs keys are **optional for Prod**; empty values are not uploaded.
