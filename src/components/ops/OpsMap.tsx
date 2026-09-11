"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { Hotspot, IncidentEvent, WindTick } from "@/lib/schema";

const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

function hotspotColor(confidence: Hotspot["confidence"]) {
  if (confidence === "high") return "#ff6b2c";
  if (confidence === "nominal") return "#ffb020";
  return "#f5c542";
}

function windFeatures(wind: WindTick[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: wind.map((w) => {
      const to = ((w.directionDeg + 180) % 360) * (Math.PI / 180);
      const km = Math.min(w.speedMps, 18) * 0.35;
      const dLat = (km / 110.57) * Math.cos(to);
      const dLon =
        (km / (111.32 * Math.cos((w.lat * Math.PI) / 180))) * Math.sin(to);
      return {
        type: "Feature" as const,
        properties: {
          eventId: w.eventId,
          speed: w.speedMps,
          dir: w.directionDeg,
          rotate: (w.directionDeg + 180) % 360,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [w.lon, w.lat],
            [w.lon + dLon, w.lat + dLat],
          ],
        },
      };
    }),
  };
}

function hotspotFeatures(hotspots: Hotspot[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: hotspots.map((h) => ({
      type: "Feature" as const,
      properties: {
        eventId: h.eventId,
        brightness: h.brightnessK,
        confidence: h.confidence,
        color: hotspotColor(h.confidence),
        radius: 5 + Math.min(h.brightnessK / 80, 8),
      },
      geometry: { type: "Point" as const, coordinates: [h.lon, h.lat] },
    })),
  };
}

export function OpsMap({ incident }: { incident: IncidentEvent }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: ref.current,
      style: DARK_STYLE,
      center: [incident.region.center.lon, incident.region.center.lat],
      zoom: 10.4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("hotspots", { type: "geojson", data: hotspotFeatures(incident.hotspots) });
      map.addSource("wind", { type: "geojson", data: windFeatures(incident.wind) });
      map.addSource("rf-sim", {
        type: "geojson",
        data: {
          type: "FeatureCollection" as const,
          features: [
            {
              type: "Feature" as const,
              properties: { label: "RF MESH · SIM", eventId: "evt_aegisfire01_tl_04" },
              geometry: {
                type: "Point" as const,
                coordinates: [
                  incident.region.center.lon - 0.06,
                  incident.region.center.lat + 0.04,
                ],
              },
            },
          ],
        },
      });

      map.addLayer({
        id: "hotspot-glow",
        type: "circle",
        source: "hotspots",
        paint: {
          "circle-radius": ["+", ["get", "radius"], 8],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.18,
          "circle-blur": 0.6,
        },
      });
      map.addLayer({
        id: "hotspots",
        type: "circle",
        source: "hotspots",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": ["get", "color"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#1a0e08",
        },
      });
      map.addLayer({
        id: "wind-lines",
        type: "line",
        source: "wind",
        paint: {
          "line-color": "#5ce1e6",
          "line-width": 1.6,
          "line-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "rf-sim",
        type: "circle",
        source: "rf-sim",
        paint: {
          "circle-radius": 5,
          "circle-color": "#8b98a8",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#5ce1e6",
        },
      });

      map.on("click", "hotspots", (e) => {
        const f = e.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        const [lon, lat] = f.geometry.coordinates;
        new maplibregl.Popup()
          .setLngLat([lon, lat])
          .setHTML(
            `<div style="font-family:ui-monospace,monospace">
              <div style="color:#ff6b2c">${f.properties?.eventId}</div>
              <div>${f.properties?.confidence} · ${Number(f.properties?.brightness).toFixed(0)} K</div>
            </div>`,
          )
          .addTo(map);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Mount once; data refresh handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const hs = map.getSource("hotspots") as GeoJSONSource | undefined;
    const wd = map.getSource("wind") as GeoJSONSource | undefined;
    hs?.setData(hotspotFeatures(incident.hotspots));
    wd?.setData(windFeatures(incident.wind));
  }, [incident]);

  return (
    <div className="relative h-full min-h-[320px] w-full">
      <div ref={ref} className="absolute inset-0" />
      <div className="pointer-events-none absolute bottom-8 left-3 rounded-md border border-[#1c2533] bg-[#0e1218]/90 px-3 py-2 text-[11px] backdrop-blur">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[#8b98a8]">
          Legend
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b2c]" /> FIRMS hotspot
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-4 bg-[#5ce1e6]" /> Wind vector (mock)
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[#5ce1e6] bg-[#8b98a8]" />{" "}
          RF mesh · SIM
        </div>
      </div>
      {incident.region.placeholder && (
        <div className="pointer-events-none absolute left-3 top-3 rounded border border-[#f5c542]/40 bg-[#0e1218]/90 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#f5c542]">
          Demo region placeholder
        </div>
      )}
    </div>
  );
}
