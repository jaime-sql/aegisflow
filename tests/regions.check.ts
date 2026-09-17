import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchFirmsHotspots } from "../src/lib/ingest/firms";
import { fetchWindTicks } from "../src/lib/ingest/wind";
import { buildWeatherNextWindSql, resolveWeatherNextTable } from "../src/lib/ingest/weathernext";
import { loadOpsIncident } from "../src/lib/incident/load";
import {
  CASCADE_BBOX,
  CASCADE_CENTER,
  DEFAULT_REGION_ID,
  EL_SALVADOR_BBOX,
  EL_SALVADOR_CENTER,
  OPS_REGIONS,
  bboxEquals,
  pointInBbox,
  remapLatLonToBbox,
  remapPoint,
  resolveRegionId,
} from "../src/lib/regions";
import { parseIncidentEvent } from "../src/lib/schema/zod";
import type { IngestEnv, IngestFetch } from "../src/lib/ingest/types";

const CASCADE_REGION = { bbox: CASCADE_BBOX, center: CASCADE_CENTER };
const ES_REGION = { bbox: EL_SALVADOR_BBOX, center: EL_SALVADOR_CENTER };

const ES_FIRMS_CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
13.7942,-89.5011,361.2,0.4,0.4,2026-09-16,1854,N,h,2.0NRT,308.1,41.0,D
13.8210,-89.3720,348.8,0.4,0.4,2026-09-16,1854,N,n,2.0NRT,304.2,22.4,D
14.0215,-88.9304,339.1,0.4,0.4,2026-09-16,1855,N,n,2.0NRT,301.8,15.7,D
`;

function clearLiveEnv(): IngestEnv {
  return {};
}

function catalog() {
  assert.equal(DEFAULT_REGION_ID, "el-salvador");
  assert.equal(OPS_REGIONS["el-salvador"].label, "El Salvador / WUI");
  assert.equal(OPS_REGIONS.cascade.label, "Cascade (AegisFire-01)");
  assert.deepEqual(EL_SALVADOR_BBOX, [-90.2, 13.1, -87.65, 14.48]);
  assert.equal(EL_SALVADOR_CENTER.lat, 13.6929);
  assert.equal(EL_SALVADOR_CENTER.lon, -89.2182);
  assert.equal(bboxEquals(CASCADE_BBOX, CASCADE_BBOX), true);
  assert.equal(bboxEquals(CASCADE_BBOX, EL_SALVADOR_BBOX), false);
  assert.equal(resolveRegionId(undefined), "el-salvador");
  assert.equal(resolveRegionId(""), "el-salvador");
  assert.equal(resolveRegionId("nope"), "el-salvador");
  assert.equal(resolveRegionId("cascade"), "cascade");
  assert.equal(resolveRegionId("AegisFire-01"), "cascade");
  assert.equal(resolveRegionId("sv-wui"), "el-salvador");
}

function remapKeepsClusterNotCenter() {
  const from = CASCADE_BBOX;
  const to = EL_SALVADOR_BBOX;
  const a = remapPoint(44.3042, -121.6418, from, to);
  const b = remapPoint(44.3364, -121.5801, from, to);
  assert.equal(pointInBbox(a.lat, a.lon, to), true);
  assert.equal(pointInBbox(b.lat, b.lon, to), true);
  assert.notEqual(a.lat.toFixed(4), b.lat.toFixed(4));
  assert.notEqual(a.lon.toFixed(4), b.lon.toFixed(4));
  assert.notEqual(a.lat.toFixed(4), EL_SALVADOR_CENTER.lat.toFixed(4));
  assert.notEqual(a.lon.toFixed(4), EL_SALVADOR_CENTER.lon.toFixed(4));

  const identity = remapLatLonToBbox(
    [{ lat: 44.321, lon: -121.548 }],
    CASCADE_BBOX,
  );
  assert.equal(identity[0]?.lat, 44.321);
  assert.equal(identity[0]?.lon, -121.548);
}

async function defaultLoadIsElSalvador() {
  const incident = await loadOpsIncident();
  parseIncidentEvent(incident);
  assert.equal(incident.region.id, "el-salvador");
  assert.equal(incident.incidentId, "SV-WUI");
  assert.equal(incident.eventId, "evt_svwui_incident");
  assert.deepEqual(incident.region.bbox, EL_SALVADOR_BBOX);
  assert.ok(incident.hotspots.length >= 2);
  for (const h of incident.hotspots) {
    assert.equal(pointInBbox(h.lat, h.lon, EL_SALVADOR_BBOX), true);
  }
  assert.ok(incident.wind.length >= 2);
  for (const w of incident.wind) {
    assert.equal(pointInBbox(w.lat, w.lon, EL_SALVADOR_BBOX), true);
  }
}

async function cascadeLoadKeepsFixtureCoords() {
  const incident = await loadOpsIncident("cascade");
  parseIncidentEvent(incident);
  assert.equal(incident.region.id, "cascade");
  assert.equal(incident.incidentId, "AegisFire-01");
  assert.deepEqual(incident.region.bbox, CASCADE_BBOX);
  assert.ok(incident.hotspots.length >= 2);
  for (const h of incident.hotspots) {
    assert.equal(pointInBbox(h.lat, h.lon, CASCADE_BBOX), true);
  }
  assert.equal(
    incident.hotspots.some((h) => h.lat === EL_SALVADOR_CENTER.lat),
    false,
  );
}

async function firmsFixtureRemapsIntoElSalvador() {
  const result = await fetchFirmsHotspots(EL_SALVADOR_BBOX, { env: clearLiveEnv() });
  assert.equal(result.usedFixture, true);
  assert.ok(result.hotspots.length >= 2);
  const lats = new Set(result.hotspots.map((h) => h.lat.toFixed(4)));
  assert.ok(lats.size >= 2, "fixture fallback must not collapse to one demo point");
  for (const h of result.hotspots) {
    assert.equal(pointInBbox(h.lat, h.lon, EL_SALVADOR_BBOX), true);
    assert.equal(h.source, "NASA_FIRMS_FIXTURE");
  }
}

async function firmsLiveMultipleCellsInElSalvador() {
  let requested: string | undefined;
  const doFetch: IngestFetch = async (input) => {
    requested = String(input);
    return new Response(ES_FIRMS_CSV, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  };
  const result = await fetchFirmsHotspots(EL_SALVADOR_BBOX, {
    env: { FIRMS_MAP_KEY: "test-map-key" },
    fetch: doFetch,
  });
  assert.ok(requested);
  assert.match(requested!, /firms\.modaps\.eosdis\.nasa\.gov/);
  assert.match(requested!, /-90\.2,13\.1,-87\.65,14\.48/);
  assert.equal(result.usedFixture, false);
  assert.equal(result.hotspots.length, 3);
  const coords = result.hotspots.map((h) => `${h.lat},${h.lon}`);
  assert.equal(new Set(coords).size, 3);
  for (const h of result.hotspots) {
    assert.equal(pointInBbox(h.lat, h.lon, EL_SALVADOR_BBOX), true);
    assert.equal(h.source, "NASA_FIRMS");
    assert.notEqual(h.lat, EL_SALVADOR_CENTER.lat);
    assert.notEqual(h.lon, EL_SALVADOR_CENTER.lon);
  }
}

async function windSqlUsesSelectedBbox() {
  const table = resolveWeatherNextTable({});
  const sqlEs = buildWeatherNextWindSql(EL_SALVADOR_BBOX, table);
  assert.match(sqlEs, /POLYGON\(\(-90\.2000 13\.1000/);
  assert.match(sqlEs, /-87\.6500 14\.4800/);

  const sqlCascade = buildWeatherNextWindSql(CASCADE_BBOX, table);
  assert.match(sqlCascade, /POLYGON\(\(-121\.9200 44\.1200/);

  const windEs = await fetchWindTicks(ES_REGION, { env: clearLiveEnv() });
  assert.equal(windEs.usedFixture, true);
  assert.ok(windEs.wind.length >= 2);
  for (const w of windEs.wind) {
    assert.equal(pointInBbox(w.lat, w.lon, EL_SALVADOR_BBOX), true);
  }

  const windCascade = await fetchWindTicks(CASCADE_REGION, { env: clearLiveEnv() });
  assert.equal(windCascade.usedFixture, true);
  for (const w of windCascade.wind) {
    assert.equal(pointInBbox(w.lat, w.lon, CASCADE_BBOX), true);
  }
}

async function loadIncidentViaApiRegionParam() {
  const es = await loadOpsIncident(null);
  const cascade = await loadOpsIncident("cascade");
  assert.equal(es.region.id, "el-salvador");
  assert.equal(cascade.region.id, "cascade");
  assert.notEqual(es.hotspots[0]?.lat.toFixed(3), cascade.hotspots[0]?.lat.toFixed(3));
}

function uiWiring() {
  const top = readFileSync("src/components/ops/TopBar.tsx", "utf8");
  assert.match(top, /OPS_REGION_OPTIONS/);
  assert.match(top, /onRegionChange/);
  assert.doesNotMatch(top, /defaultValue=\{incident\.incidentId\}/);
  const regionsSrc = readFileSync("src/lib/regions.ts", "utf8");
  assert.match(regionsSrc, /El Salvador \/ WUI/);
  assert.match(regionsSrc, /Cascade \(AegisFire-01\)/);

  const shell = readFileSync("src/components/ops/OpsShell.tsx", "utf8");
  assert.match(shell, /\/api\/ops\/incident\?region=/);
  assert.match(shell, /FeedBanner/);
  assert.match(shell, /65%/);
  assert.match(shell, /setIncident/);

  const map = readFileSync("src/components/ops/OpsMap.tsx", "utf8");
  assert.match(map, /drawIncidentLayers/);
  assert.match(map, /fitBounds/);
  assert.match(map, /ExperimentalBadge/);
  assert.match(map, /#3DB9FF/);
  assert.match(map, /SimBadge label="RF"/);

  const route = readFileSync("src/app/api/ops/incident/route.ts", "utf8");
  assert.match(route, /searchParams\.get\("region"\)/);

  const docs = readFileSync("docs/regions.md", "utf8");
  assert.match(docs, /-90\.20, 13\.10, -87\.65, 14\.48/);
  assert.match(docs, /el-salvador/);
}

async function main() {
  catalog();
  remapKeepsClusterNotCenter();
  await defaultLoadIsElSalvador();
  await cascadeLoadKeepsFixtureCoords();
  await firmsFixtureRemapsIntoElSalvador();
  await firmsLiveMultipleCellsInElSalvador();
  await windSqlUsesSelectedBbox();
  await loadIncidentViaApiRegionParam();
  uiWiring();
  console.log("OK  region picker (El Salvador default + Cascade remap)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
