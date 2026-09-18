# WeatherNext ingest (Stage 2 Phase 1)

Ops maps **WeatherNext 3** 10 m wind as a cyan overlay on the **same** Ops map. Default bbox is **El Salvador / WUI**; Cascade (AegisFire-01) is selectable from the TopBar. Real-time WeatherNext is **Experimental** (historic data is CC BY 4.0). There is no second map. Region catalog: [`docs/regions.md`](regions.md).

## GCP project

| Item | Value |
| --- | --- |
| Project | `aegisflow-ieee-quest` |
| Approved tenant | `maitrosoft.ai@gmail.com` (WeatherNext allowlist) |
| Surface this sprint | **BigQuery** (Analytics Hub linked tables) |
| Auth | Worker secret `GCP_SA_JSON` (service-account JSON). Local: `GOOGLE_APPLICATION_CREDENTIALS` path or JSON, or `GOOGLE_APPLICATION_CREDENTIALS_JSON`. |

Never commit credentials. CI runs adapters with empty secrets and expects fixture fallback.

## Dataset IDs

WeatherNext 3 is not a public BigQuery dataset you query as `bigquery-public-data.*`. After the allowlisted Gmail subscribes to the **WeatherNext 3 BigQuery Analytics Hub** listing, tables are linked into a dataset **you name** in `aegisflow-ieee-quest`.

| Linked table | Resolution | Ops use |
| --- | --- | --- |
| `{project}.{dataset}.weathernext_3_0_0_0p1deg` | 0.1° grid | **This adapter** — `wind_speed_10m_*`, `u_component_of_wind_10m_mean`, `v_component_of_wind_10m_mean` |
| `{project}.{dataset}.weathernext_3_0_0_0p05deg` | 0.05° stations | Temperature / dewpoint only — not used for wind |

Defaults (override with env / Wrangler vars):

```
GCP_PROJECT_ID=aegisflow-ieee-quest
WEATHERNEXT_BQ_DATASET=weathernext
WEATHERNEXT_BQ_TABLE=weathernext_3_0_0_0p1deg
WEATHERNEXT_BQ_LOCATION=US
```

If Jaime’s Analytics Hub link used a different dataset id, set `WEATHERNEXT_BQ_DATASET` to that id. The Worker then queries:

`aegisflow-ieee-quest.<WEATHERNEXT_BQ_DATASET>.weathernext_3_0_0_0p1deg`

### Other surfaces (not queried this PR)

| Surface | ID |
| --- | --- |
| Earth Engine 0.1° | `projects/gcp-public-data-weathernext/assets/weathernext_3_0_0_0p1deg` |
| Earth Engine 0.05° | `projects/gcp-public-data-weathernext/assets/weathernext_3_0_0_0p05deg` |
| GCS ensemble Zarr | `gs://weathernext3_spatial/weathernext_3_0_0/zarr/` |
| GCS statistics Zarr | `gs://weathernext3_statistics_spatial/weathernext_3_0_0_statistics/zarr/` |

Docs: [BigQuery guide](https://developers.google.com/weathernext/guides/bigquery), [access](https://developers.google.com/weathernext/guides/access-forecast).

## Adapter interface

```ts
type WeatherNextQueryClient = {
  queryWind(sql: string): Promise<WeatherNextWindRow[]>;
};

// Ops / judge click path — KV only, never BigQuery
fetchWindTicks(region: { id?: string; bbox: BBox; center: GeoPoint }, deps?: {
  kv?: WindKv | null;
  env?: IngestEnv;
}): Promise<WindResult>

// Cron / refresh path — #14 SQL into KV (90s BigQuery budget, not the click fail-fast)
refreshPickerRegionWindCache(deps: {
  kv: WindKv;
  client?: WeatherNextQueryClient; // tests
  fetch?: typeof fetch;
  env?: IngestEnv;
}): Promise<WindRefreshResult[]>
```

**Ops request path** reads Cloudflare KV keys `wind:el-salvador` and `wind:cascade` only. It never runs BigQuery mid-request (that is what hung the Worker before #14). Fresh cached cells (`source: "WEATHERNEXT"`, `refreshedAt` within 15 minutes) → cyan overlay + TopBar **Live**. Empty / stale / miss → existing honest fixture + FeedBanner `Degraded · Wind · fallback`. Raw BigQuery strings stay in Worker logs.

**Background refresh** (OpenNext custom Worker `scheduled` handler, cron `*/8 * * * *` UTC): queries **both picker regions only** (El Salvador / WUI + Cascade). Same #14 SQL budget:

- `init_time` lookback on **both** the latest-init CTE and the base table (partition prune; default 12 hours)
- clustered `geography` intersected with the **active region bbox**
- lead hours `BETWEEN 1 AND 6` (nearest hour in that window)
- `LIMIT 24` cells (map samples 16)
- **Cron/admin only:** `jobs.query` waits ~20s, then up to **five** `getQueryResults` polls, **90s wall** per region (Cloudflare scheduled duration limit is 15 min). The judge-click fail-fast (~12s + 1 poll, 22s wall) is unused on this path.

Cost: 2 regions × ~7.5 refreshes/hour ≈ **12–16 small queries/hour**, not one query per Ops load. Failed refreshes leave the previous KV value in place (no empty overwrite). World-wide regions are out of scope.

Each refresh logs a single JSON line `weathernext_cache_refresh` with `ok` plus per-region `{ regionId, ok, cells, error }`.

**One-shot fill (optional):** signed-in `GET`/`POST` `/aegisflow/api/ops/wind-cache-refresh` (Clerk-protected, same as Ops). Uses the cron BigQuery budget so Jaime can seed KV without waiting for the next `*/8` tick.

Local / CI / KV unbound: skip gracefully to the AegisFire-01 fixture (`ok`, live skipped). `AEGISFLOW_FAIL_WIND=true` → empty vectors + `down`. Force skip even with creds: `AEGISFLOW_USE_WEATHERNEXT_FIXTURE=true`.

## Jaime — enable live wind

1. In GCP project **`aegisflow-ieee-quest`** (signed in as the approved Gmail), subscribe to the WeatherNext 3 Analytics Hub listing. Note the linked **dataset id**.
2. Create a service account with `roles/bigquery.jobUser` and `roles/bigquery.dataViewer` on that dataset. Download the JSON key.
3. GitHub → Settings → Secrets and variables → Actions on [jaime-sql/aegisflow](https://github.com/jaime-sql/aegisflow):
   - `GCP_SA_JSON` — the full service-account JSON
   - `FIRMS_MAP_KEY` — NASA FIRMS MAP key (hotspots)
4. If the linked dataset is not named `weathernext`, set Wrangler var `WEATHERNEXT_BQ_DATASET` (or GitHub variable) to the real id.
5. **Cloudflare KV** (one-time if the prod workflow cannot create it): the Cloudflare Prod job runs `scripts/ensure-wind-cache-kv.mjs`, which creates or reuses namespace `aegisflow-WIND_CACHE` and binds it as `WIND_CACHE`. The API token needs Workers KV edit. If that step fails:

```bash
npx wrangler kv namespace create WIND_CACHE
# paste the printed id into wrangler.jsonc kv_namespaces[0].id
```

6. Re-run **Cloudflare Prod**. The workflow uploads `GCP_SA_JSON` and `FIRMS_MAP_KEY` as Wrangler secrets on Worker `aegisflow`, binds KV, and deploys the cron:

```bash
npx wrangler secret put FIRMS_MAP_KEY
npx wrangler secret put GCP_SA_JSON
```

Until secrets + KV exist, Ops keeps serving the remapped AegisFire-01 fixture in the selected bbox and does not blank the page. After the first successful cron (~8 minutes, or Cloudflare Dashboard → Worker `aegisflow` → Triggers → Cron → Send now), El Salvador and Cascade serve cyan **WIND LIVE** from cache. Signed-in one-shot: `GET https://cortexmatter.com/aegisflow/api/ops/wind-cache-refresh` (waits on BigQuery, then writes KV).

Local: `next dev` skips KV. `wrangler dev --test-scheduled` then `curl "http://localhost:8787/__scheduled?cron=*/8+*+*+*+*"` exercises the refresh handler against simulated KV.
