import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cloneFixtureIncident } from "../src/lib/fixtures/aegisfire-01";
import { loadOpsIncident } from "../src/lib/incident/load";
import { pointInBbox } from "../src/lib/regions";
import type { IncidentEvent } from "../src/lib/schema";
import {
  DEFAULT_LAYER_VISIBILITY,
  MAP_LAYER_KEYS,
  MAP_LAYER_LABELS,
  mapLayerCounts,
} from "../src/lib/ui/map-layers";
import {
  CLUSTER_LINK_DISTANCE,
  PREDICTED_DASH,
  PREDICTED_FILL,
  PREDICTED_FILL_OPACITY,
  PREDICTED_SPREAD_POPUP,
  PREDICTED_STROKE_PX,
  clusterHotspots,
  predictedSpreadGeoJson,
  predictedSpreadPopupHtml,
  propagationConeIsSim,
} from "../src/lib/ui/spread-cone";
import { isFirmsDemoFixture } from "../src/lib/ui/firms-demo";
import {
  WIND_FALLBACK_COLOR,
  WIND_LIVE_COLOR,
  isLiveWeatherNextWind,
  windOverlayColor,
} from "../src/lib/ui/wind-feed";

function assertTheater(incident: IncidentEvent, label: string) {
  const clusters = clusterHotspots(incident.hotspots, incident.region.bbox);
  assert.ok(
    clusters.length >= 3 && clusters.length <= 5,
    `${label} expected 3–5 hotspot clusters, got ${clusters.length}`,
  );
  for (const cluster of clusters) {
    assert.ok(
      cluster.hotspots.length >= 3,
      `${label} cluster has ${cluster.hotspots.length} pins (lonely pin)`,
    );
  }
  assert.ok(
    incident.wind.length >= 8 && incident.wind.length <= 16,
    `${label} expected 8–16 wind vectors, got ${incident.wind.length}`,
  );
  for (const tick of incident.wind) {
    assert.equal(tick.source, "MOCK_WIND");
    assert.equal(isLiveWeatherNextWind(tick), false);
    assert.equal(windOverlayColor(tick), WIND_FALLBACK_COLOR);
    assert.notEqual(windOverlayColor(tick), WIND_LIVE_COLOR);
  }
  assert.equal(isFirmsDemoFixture(incident), true);
}

function ringOf(incident: IncidentEvent): number[][] {
  const collection = predictedSpreadGeoJson(incident);
  assert.equal(collection.type, "FeatureCollection");
  assert.equal(collection.features.length, 1);
  const feature = collection.features[0]!;
  assert.equal(feature.geometry.type, "Polygon");
  assert.equal(feature.properties.label, PREDICTED_SPREAD_POPUP);
  assert.equal(feature.properties.layer, "Predicted");
  assert.equal(feature.properties.fill, PREDICTED_FILL);
  assert.equal(feature.properties.fillOpacity, PREDICTED_FILL_OPACITY);
  assert.equal(feature.properties.strokeWidthPx, PREDICTED_STROKE_PX);
  assert.equal(feature.properties.dashed, true);
  assert.equal(feature.properties.satellite, false);
  assert.equal(mapLayerCounts(incident).predicted, collection.features.length);
  const ring = feature.geometry.coordinates[0]!;
  assert.ok(ring.length >= 4);
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  return ring;
}

function coneRemapsWithRegion() {
  const cascade = cloneFixtureIncident();
  const ring = ringOf(cascade);
  const primary = clusterHotspots(cascade.hotspots, cascade.region.bbox)[0]!;
  const apex = { lon: ring[0]![0]!, lat: ring[0]![1]! };
  const dLat = Math.abs(apex.lat - primary.centroid.lat);
  const dLon = Math.abs(apex.lon - primary.centroid.lon);
  assert.ok(dLat < 0.08 && dLon < 0.12, "cone apex stays on the primary cluster");

  const [west, south, east, north] = cascade.region.bbox;
  const marginLat = (north - south) * 0.35;
  const marginLon = (east - west) * 0.35;
  for (const [lon, lat] of ring) {
    assert.equal(
      pointInBbox(lat!, lon!, [
        west - marginLon,
        south - marginLat,
        east + marginLon,
        north + marginLat,
      ]),
      true,
      `cone vertex ${lat},${lon} left the cascade theater`,
    );
  }
}

async function regionSwitchRemapsCone() {
  const elSalvador = await loadOpsIncident("el-salvador");
  const cascade = await loadOpsIncident("cascade");
  assertTheater(elSalvador, "el-salvador");
  assertTheater(cascade, "cascade");
  assert.equal(
    clusterHotspots(elSalvador.hotspots, elSalvador.region.bbox).length,
    clusterHotspots(cascade.hotspots, cascade.region.bbox).length,
  );

  const esRing = ringOf(elSalvador);
  const cascadeRing = ringOf(cascade);
  assert.notDeepEqual(esRing, cascadeRing);
  const [west, south, east, north] = elSalvador.region.bbox;
  for (const [lon, lat] of esRing) {
    assert.ok(
      lon! > west - 1 && lon! < east + 1 && lat! > south - 1 && lat! < north + 1,
      `El Salvador cone vertex ${lat},${lon} did not remap into the region`,
    );
  }
  assert.notEqual(
    elSalvador.hotspots[0]?.lat.toFixed(2),
    cascade.hotspots[0]?.lat.toFixed(2),
  );
}

function simStillDrawsCone() {
  const fixture = cloneFixtureIncident();
  assert.equal(propagationConeIsSim(fixture), true);
  const html = predictedSpreadPopupHtml(true);
  assert.match(html, /Predicted spread · agent/);
  assert.match(html, /SIM · predicted, not satellite/);
  assert.doesNotMatch(html, /live/i);
  assert.equal(predictedSpreadGeoJson(fixture).features.length, 1);

  const liveAgent = {
    ...fixture,
    agents: fixture.agents.map((agent) =>
      agent.agentId === "fire-propagation"
        ? { ...agent, model: { ...agent.model, used: "openai" as const }, degraded: false }
        : agent,
    ),
  };
  assert.equal(propagationConeIsSim(liveAgent), false);
  const liveHtml = predictedSpreadPopupHtml(false);
  assert.match(liveHtml, /Predicted spread · agent/);
  assert.doesNotMatch(liveHtml, /live/i);
  assert.doesNotMatch(liveHtml, /SIM · predicted/);
  assert.equal(predictedSpreadGeoJson(liveAgent).features.length, 1);

  const empty = { ...fixture, hotspots: [] as IncidentEvent["hotspots"] };
  assert.equal(predictedSpreadGeoJson(empty).features.length, 0);
  assert.equal(mapLayerCounts(empty).predicted, 0);
}

function legendContract() {
  assert.deepEqual([...MAP_LAYER_KEYS], ["hotspots", "wind", "agents", "predicted"]);
  assert.equal(MAP_LAYER_LABELS.predicted, "Predicted");
  assert.equal(DEFAULT_LAYER_VISIBILITY.predicted, true);
  assert.equal(PREDICTED_FILL, "#FF4D2E");
  assert.equal(PREDICTED_FILL_OPACITY, 0.18);
  assert.equal(PREDICTED_STROKE_PX, 1.5);
  assert.match(PREDICTED_DASH, /\d+ \d+/);
  assert.ok(CLUSTER_LINK_DISTANCE > 0.05 && CLUSTER_LINK_DISTANCE < 0.2);

  const map = readFileSync("src/components/ops/OpsMap.tsx", "utf8");
  const stack = readFileSync("src/components/ops/MapLegendStack.tsx", "utf8");
  assert.match(map, /drawPredicted/);
  assert.match(map, /fillOpacity: PREDICTED_FILL_OPACITY/);
  assert.match(map, /dashArray: PREDICTED_DASH/);
  assert.match(map, /weight: PREDICTED_STROKE_PX/);
  assert.doesNotMatch(map, /drawOsint|drawCctv|drawFlights|drawCrypto|drawNews/);
  assert.doesNotMatch(map, /box-shadow|drop-shadow|filter:\s*["']blur/);
  assert.match(stack, /layer === "predicted"/);
  assert.match(stack, /rgba\(255,77,46,0\.18\)/);
  assert.doesNotMatch(stack, /Predicted spread · live/i);
}

async function main() {
  const fixture = cloneFixtureIncident();
  assertTheater(fixture, "fixture");
  coneRemapsWithRegion();
  await regionSwitchRemapsCone();
  simStillDrawsCone();
  legendContract();
  console.log("OK  dense DEMO theater + predicted spread cone");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
