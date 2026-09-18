# Ops regions (Stage 2 region cut)

Product lock: **Option 2** — keep Cascade and add a region picker. **El Salvador / WUI is the default** FIRMS + WeatherNext query bbox and the Ops map initial view. Cascade (AegisFire-01) stays selectable. This is **not** a second map: the TopBar incident/region control remaps hotspots and wind in place.

Bbox order is always `[west, south, east, north]` (NASA FIRMS area CSV + WeatherNext `ST_GEOGFROMTEXT`).

## El Salvador / WUI (default)

| Field | Value |
| --- | --- |
| Region id | `el-salvador` |
| TopBar label | El Salvador / WUI |
| Incident id | `SV-WUI` |
| Bbox | **`[-90.20, 13.10, -87.65, 14.48]`** |
| Center | San Salvador metro **`13.6929, -89.2182`** (primary WUI population; map still `fitBounds` the bbox) |
| Span | ~2.55° × 1.38° (under the FIRMS area API 10° limit) |

Corner rationale:

| Corner | Lon / lat | Why |
| --- | --- | --- |
| west | -90.20 | ~8 km west of Ahuachapán into Guatemala coffee / volcanic WUI (transboundary) |
| south | 13.10 | Pacific littoral (Acajutla–La Libertad) with margin |
| east | -87.65 | La Unión / Gulf of Fonseca, slight Honduras buffer |
| north | 14.48 | Chalatenango / Citalá pine WUI, Ocotepeque fringe |

Coverage is **national WUI + nearby highland fringe**, not a single demo cell. Live FIRMS rows in the bbox are plotted as returned (capped at 40 detections). They are **not** snapped to San Salvador.

## Cascade (AegisFire-01)

| Field | Value |
| --- | --- |
| Region id | `cascade` |
| TopBar label | Cascade (AegisFire-01) |
| Incident id | `AegisFire-01` |
| Bbox | `[-121.92, 44.12, -121.28, 44.52]` |
| Center | `44.321, -121.548` (Sisters / Hwy 20) |

This is the Stage 1 fixture region. Selecting it re-queries FIRMS for that bbox and pans the same Leaflet map. WeatherNext wind is **cache-only** on the request path (KV keys `wind:el-salvador` / `wind:cascade`); cron refreshes both picker regions every ~8 minutes. See [`docs/weathernext.md`](weathernext.md).

## Fixture fallback

When `FIRMS_MAP_KEY` / `GCP_SA_JSON` are unset (CI, local, or Worker before secrets), adapters still return the AegisFire-01 hotspot/wind cluster so Ops never blanks. For El Salvador those points are **linearly remapped** into the SV bbox (relative cluster shape preserved). Cascade keeps native fixture coordinates. Live detections are never remapped.

## API

```
GET /api/ops/incident              → default region (el-salvador)
GET /api/ops/incident?region=el-salvador
GET /api/ops/incident?region=cascade
```

Unknown `region` values fall back to El Salvador / WUI.

## Live Worker picker (Design + QA)

Acceptance on workers.dev and cortexmatter (`basePath` `/aegisflow`):

- The region control stays **clickable** (never `disabled` / greyed).
- El Salvador → Cascade remaps **map + FIRMS + wind + chips in one shot** (and back).
- Click-with-no-remap is a bug.

The TopBar control is a **GET form** to `{basePath}/ops?region=`. A native HTML `onchange` is baked into the server HTML so OpenNext does not depend on a client `fetch` that can 404, hang (and grey the select), or swallow errors. The Ops page already loads FIRMS + wind from `searchParams.region`. Form `action` uses `withBasePath("/ops")` so navigation stays under `/aegisflow` (never apex `/` or unprefixed `/ops`).

`withBasePath()` still reads `process.env.NEXT_PUBLIC_BASE_PATH` as a direct member expression (Next.js does not inline `process.env` as an object in the browser) and infers `/aegisflow` from the current pathname.
