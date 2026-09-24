"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Hotspot, IncidentEvent, WindTick } from "@/lib/schema";
import { PUBLIC_CROWD_COPY } from "@/lib/pii";
import { withBasePath } from "@/lib/base-path";
import { isFirmsDemoFixture, hotspotPopupHtml } from "@/lib/ui/firms-demo";
import {
  isLiveWeatherNextWind,
  windOverlayColor,
} from "@/lib/ui/wind-feed";
import {
  PREDICTED_DASH,
  PREDICTED_FILL,
  PREDICTED_FILL_OPACITY,
  PREDICTED_STROKE_PX,
  predictedSpreadGeoJson,
  predictedSpreadPopupHtml,
  propagationConeIsSim,
} from "@/lib/ui/spread-cone";
import {
  DEFAULT_LAYER_VISIBILITY,
  MAP_LAYER_KEYS,
  agentMapAnchor,
  agentMarkerLetter,
  agentPopupHtml,
  type MapLayerKey,
  type MapLayerVisibility,
} from "@/lib/ui/map-layers";
import { MapLegendStack } from "./MapLegendStack";

const leafletIconPath = withBasePath("/leaflet");

type LayerGroups = Record<MapLayerKey, L.LayerGroup> & {
  extras: L.LayerGroup;
};

function hotspotColor(confidence: Hotspot["confidence"]) {
  if (confidence === "high") return "#FF4D2E";
  if (confidence === "nominal") return "#FFB020";
  return "#FFB020";
}

function windDest(w: WindTick): [number, number] {
  const to = ((w.directionDeg + 180) % 360) * (Math.PI / 180);
  const km = Math.min(w.speedMps, 18) * 0.35;
  const dLat = (km / 110.57) * Math.cos(to);
  const dLon = (km / (111.32 * Math.cos((w.lat * Math.PI) / 180))) * Math.sin(to);
  return [w.lat + dLat, w.lon + dLon];
}

function drawHotspots(group: L.LayerGroup, incident: IncidentEvent) {
  group.clearLayers();
  const firmsDemoFixture = isFirmsDemoFixture(incident);
  for (const h of incident.hotspots) {
    L.circleMarker([h.lat, h.lon], {
      radius: 4 + Math.min(h.brightnessK / 140, 4),
      color: "#1a0e08",
      weight: 1,
      fillColor: hotspotColor(h.confidence),
      fillOpacity: 0.9,
    })
      .bindPopup(hotspotPopupHtml(h, firmsDemoFixture))
      .addTo(group);
  }
}

function drawWind(group: L.LayerGroup, incident: IncidentEvent) {
  group.clearLayers();
  for (const w of incident.wind) {
    const dest = windDest(w);
    const live = isLiveWeatherNextWind(w);
    const color = windOverlayColor(w);
    L.polyline(
      [
        [w.lat, w.lon],
        dest,
      ],
      {
        color,
        weight: live ? 2 : 1.5,
        opacity: live ? 0.9 : 0.55,
      },
    ).addTo(group);
    L.circleMarker(dest, {
      radius: live ? 3 : 2.5,
      color,
      fillColor: color,
      fillOpacity: 1,
      weight: 0,
    })
      .bindPopup(
        `<div style="font-family:ui-monospace,monospace">${live ? "WeatherNext · Experimental<br/>" : ""}${w.eventId}<br/>${w.speedMps} m/s from ${w.directionDeg}°</div>`,
      )
      .addTo(group);
  }
}

/** Downwind sector from the primary cluster. Flat fill and a dashed stroke. */
function drawPredicted(group: L.LayerGroup, incident: IncidentEvent) {
  group.clearLayers();
  const collection = predictedSpreadGeoJson(incident);
  if (collection.features.length === 0) return;
  const html = predictedSpreadPopupHtml(propagationConeIsSim(incident));
  L.geoJSON(collection, {
    style: () => ({
      color: PREDICTED_FILL,
      weight: PREDICTED_STROKE_PX,
      opacity: 1,
      dashArray: PREDICTED_DASH,
      fillColor: PREDICTED_FILL,
      fillOpacity: PREDICTED_FILL_OPACITY,
      lineCap: "butt",
      lineJoin: "round",
    }),
    onEachFeature: (_feature, layer) => {
      layer.bindPopup(html);
    },
  }).addTo(group);
}

function drawAgents(group: L.LayerGroup, incident: IncidentEvent) {
  group.clearLayers();
  for (const agent of incident.agents) {
    const { lat, lon } = agentMapAnchor(agent, incident);
    const letter = agentMarkerLetter(agent.agentId);
    L.marker([lat, lon], {
      zIndexOffset: 420,
      icon: L.divIcon({
        className: "ops-agent-marker",
        html: `<div class="ops-agent-diamond"><span>${letter}</span></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    })
      .bindPopup(agentPopupHtml(agent))
      .addTo(group);
  }
}

/** RF SIM + Cascade corridor / crowd — always on, not legend toggles. */
function drawExtras(group: L.LayerGroup, incident: IncidentEvent) {
  group.clearLayers();
  L.circleMarker(
    [incident.region.center.lat + 0.04, incident.region.center.lon - 0.06],
    {
      radius: 6,
      color: "#3DB9FF",
      weight: 2,
      fillColor: "#8B9BB8",
      fillOpacity: 0.9,
    },
  )
    .bindPopup("RF / edge mesh · SIM<br/>evt_aegisfire01_tl_04")
    .addTo(group);

  if (incident.region.id === "cascade") {
    L.polyline(
      [
        [44.304, -121.642],
        [44.312, -121.58],
        [44.291, -121.549],
        [44.272, -121.48],
      ],
      {
        color: "#3DDC97",
        weight: 3,
        opacity: 0.85,
        dashArray: "8 6",
      },
    )
      .bindPopup("Safe corridor · Hwy 20 EB (planned)")
      .addTo(group);

    L.circleMarker([44.301, -121.525], {
      radius: 6,
      color: "#FFB020",
      weight: 2,
      fillColor: "#121A2B",
      fillOpacity: 0.95,
    })
      .bindPopup(
        `<div style="font-family:ui-monospace,monospace">
          <div><strong>Citizen report</strong> · evt_aegisfire01_crowd_01</div>
          <div>${PUBLIC_CROWD_COPY}</div>
          <div style="opacity:.7">original PII never shown in Ops panels</div>
        </div>`,
      )
      .addTo(group);
  }
}

function drawIncidentLayers(groups: LayerGroups, incident: IncidentEvent) {
  drawHotspots(groups.hotspots, incident);
  drawWind(groups.wind, incident);
  drawAgents(groups.agents, incident);
  drawPredicted(groups.predicted, incident);
  drawExtras(groups.extras, incident);
}

function applyLayerVisibility(
  map: L.Map,
  groups: LayerGroups,
  visible: MapLayerVisibility,
) {
  for (const key of MAP_LAYER_KEYS) {
    const group = groups[key];
    const on = visible[key];
    if (on && !map.hasLayer(group)) group.addTo(map);
    if (!on && map.hasLayer(group)) map.removeLayer(group);
  }
}

function fitRegion(map: L.Map, incident: IncidentEvent) {
  const [west, south, east, north] = incident.region.bbox;
  const maxZoom = incident.region.id === "el-salvador" ? 9 : 12;
  map.fitBounds(
    [
      [south, west],
      [north, east],
    ],
    { padding: [28, 28], maxZoom, animate: false },
  );
}

export function OpsMap({ incident }: { incident: IncidentEvent }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupsRef = useRef<LayerGroups | null>(null);
  const [visible, setVisible] = useState<MapLayerVisibility>(
    DEFAULT_LAYER_VISIBILITY,
  );
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    L.Icon.Default.mergeOptions({
      iconUrl: `${leafletIconPath}/marker-icon.png`,
      iconRetinaUrl: `${leafletIconPath}/marker-icon-2x.png`,
      shadowUrl: `${leafletIconPath}/marker-shadow.png`,
    });

    const map = L.map(ref.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([incident.region.center.lat, incident.region.center.lon], 8);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      subdomains: "abc",
      className: "ops-dark-tiles",
      maxZoom: 19,
    }).addTo(map);

    const groups: LayerGroups = {
      hotspots: L.layerGroup(),
      wind: L.layerGroup(),
      agents: L.layerGroup(),
      predicted: L.layerGroup(),
      extras: L.layerGroup().addTo(map),
    };
    groupsRef.current = groups;
    mapRef.current = map;
    drawIncidentLayers(groups, incident);
    applyLayerVisibility(map, groups, DEFAULT_LAYER_VISIBILITY);
    fitRegion(map, incident);
    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapRef.current = null;
      groupsRef.current = null;
    };
    // Map instance is created once; overlays remap when `incident` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const groups = groupsRef.current;
    if (!map || !groups) return;
    drawIncidentLayers(groups, incident);
    applyLayerVisibility(map, groups, visibleRef.current);
    fitRegion(map, incident);
    map.invalidateSize();
  }, [incident]);

  useEffect(() => {
    const map = mapRef.current;
    const groups = groupsRef.current;
    if (!map || !groups) return;
    applyLayerVisibility(map, groups, visible);
  }, [visible]);

  function onToggle(layer: MapLayerKey) {
    setVisible((prev) => ({ ...prev, [layer]: !prev[layer] }));
  }

  return (
    <div className="relative h-full min-h-[320px] w-full">
      <div ref={ref} className="absolute inset-0 z-0" />
      <div className="pointer-events-none absolute bottom-16 left-3 z-[500]">
        <MapLegendStack
          incident={incident}
          visible={visible}
          onToggle={onToggle}
        />
      </div>
      {incident.region.placeholder && (
        <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded border border-[#FFB020]/40 bg-[#121A2B]/90 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#FFB020]">
          Demo region placeholder
        </div>
      )}
    </div>
  );
}
