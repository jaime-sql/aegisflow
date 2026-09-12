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

Without API keys, Ops loads the **AegisFire-01** fixture (map, exec summary, lineage chips, dispatch, resource bars, timeline).

| Check | URL |
| --- | --- |
| Ops dashboard | http://localhost:3000/ops |
| Viewer (bypass) | http://localhost:3000/ops?role=viewer |
| Clerk sign-in | http://localhost:3000/sign-in |
| Fabric twin (same IDs, no map) | http://localhost:3000/fabric |
| Incident JSON | http://localhost:3000/api/ops/incident |

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
| `FIRMS_MAP_KEY` | NASA FIRMS area API. Empty → fixture hotspots. |
| `OPENAI_API_KEY` / `DEEPSEEK_*` | Reserved for Stage 2 live LLM. Stage 1 agents return fixtures. |
| `MODAL_ENDPOINT` | Reserved. Empty → `runtime: "local"` on agent outputs. |
| `AEGISFLOW_LIVE_LLM` | Must be `true` before any live LLM path is used (still a stub in Stage 1). |

## Repo layout

```
src/app/                 /ops dashboard + /fabric twin + /sign-in + /api/ops/incident
src/components/ops/      TopBar, MapShell, ExecSummary, AgentChip, Dispatch, lineage drawer
src/lib/schema/          Zod + JSON Schema + eventId helpers
src/lib/base-path.ts     env-driven `/aegisflow` prefix
src/lib/ingest/          firms.ts · wind.ts
src/lib/agents/          three stubs + OpenAI/DeepSeek/Modal runtime
src/lib/pii.ts           crowdsource scrubber
fixtures/aegisfire-01.json
docs/event-schema.md
workers/modal_stub.py
workers/aegisflow-path/  Cloudflare path Worker (cortexmatter.com/aegisflow only)
.github/workflows/cloudflare-prod.yml
```

## Cloudflare production (`cortexmatter.com/aegisflow`)

Locked prod URL: **https://cortexmatter.com/aegisflow**. The apex `cortexmatter.com/` stays free for other apps. The path Worker only claims `cortexmatter.com/aegisflow` and `cortexmatter.com/aegisflow/*`.

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
   - Optional: `FIRMS_MAP_KEY` (otherwise Ops uses the fixture). Set it as a Wrangler secret on Worker `aegisflow` if you want live FIRMS in prod.
4. **Actions → Cloudflare Prod → Run workflow** (or push a `prod-*` tag). The workflow runs `npm ci`, `npm test`, `npm run build` with `BASE_PATH=/aegisflow`, OpenNext-adapts the build, deploys Worker `aegisflow` (uploads `CLERK_SECRET_KEY` **and** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` as Worker secrets; path vars come from `wrangler.jsonc`), then deploys `workers/aegisflow-path`.
5. **QA smoke**
   - `https://cortexmatter.com/` is **not** AegisFlow (other apps).
   - `https://cortexmatter.com/aegisflow` → Clerk sign-in (`/aegisflow/sign-in`) or `/aegisflow/ops` after auth. Must **not** be HTTP 500.
   - Signed-out `/aegisflow/ops` → **redirect to sign-in** (not a Clerk 404 `protect-rewrite`).
   - Sign-in / sign-up stay under `/aegisflow/...` and return 200 with the Clerk widget (Dev keys show Clerk’s development banner).
   - Map tiles + `/aegisflow/_next/...` + `/aegisflow/leaflet/...` load.
   - Viewer vs Manager still works (Clerk `publicMetadata.role`).
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

AegisFlow is an original IEEE Response Quest submission (#5395). Sample FIRMS, wind, and agent payloads are synthetic fixtures for the Cascade Range placeholder.

## Secrets

Do not commit Clerk, FIRMS, OpenAI, DeepSeek, Modal, or Cloudflare API tokens. `.env.local` and `.dev.vars` stay on the machine. GitHub Actions secrets are the only place `CLOUDFLARE_API_TOKEN` / `CLERK_SECRET_KEY` belong.
