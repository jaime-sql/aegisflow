"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Hotspot, IncidentEvent, WindTick } from "@/lib/schema";

function hotspotColor(confidence: Hotspot["confidence"]) {
  if (confidence === "high") return "#ff6b2c";
  if (confidence === "nominal") return "#ffb020";
  return "#f5c542";
}

function windDest(w: WindTick): [number, number] {
  const to = ((w.directionDeg + 180) % 360) * (Math.PI / 180);
  const km = Math.min(w.speedMps, 18) * 0.35;
  const dLat = (km / 110.57) * Math.cos(to);
  const dLon = (km / (111.32 * Math.cos((w.lat * Math.PI) / 180))) * Math.sin(to);
  return [w.lat + dLat, w.lon + dLon];
}

export function OpsMap({ incident }: { incident: IncidentEvent }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = L.map(ref.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([incident.region.center.lat, incident.region.center.lon], 11);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      subdomains: "abc",
      className: "ops-dark-tiles",
      maxZoom: 19,
    }).addTo(map);

    for (const h of incident.hotspots) {
      L.circleMarker([h.lat, h.lon], {
        radius: 5 + Math.min(h.brightnessK / 80, 8),
        color: "#1a0e08",
        weight: 1,
        fillColor: hotspotColor(h.confidence),
        fillOpacity: 0.9,
      })
        .bindPopup(
          `<div style="font-family:ui-monospace,monospace;color:#111">
            <div style="color:#c2410c">${h.eventId}</div>
            <div>${h.confidence} · ${h.brightnessK.toFixed(0)} K</div>
          </div>`,
        )
        .addTo(map);
    }

    for (const w of incident.wind) {
      const dest = windDest(w);
      L.polyline([[w.lat, w.lon], dest], {
        color: "#5ce1e6",
        weight: 2,
        opacity: 0.9,
      }).addTo(map);
      L.circleMarker(dest, {
        radius: 3,
        color: "#5ce1e6",
        fillColor: "#5ce1e6",
        fillOpacity: 1,
        weight: 0,
      })
        .bindPopup(
          `<div style="font-family:ui-monospace,monospace">${w.eventId}<br/>${w.speedMps} m/s from ${w.directionDeg}°</div>`,
        )
        .addTo(map);
    }

    L.circleMarker(
      [incident.region.center.lat + 0.04, incident.region.center.lon - 0.06],
      {
        radius: 6,
        color: "#5ce1e6",
        weight: 2,
        fillColor: "#8b98a8",
        fillOpacity: 0.9,
      },
    )
      .bindPopup("RF MESH · SIM<br/>evt_aegisfire01_tl_04")
      .addTo(map);

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full min-h-[320px] w-full">
      <div ref={ref} className="absolute inset-0 z-0" />
      <div className="pointer-events-none absolute bottom-8 left-3 z-[500] rounded-md border border-[#1c2533] bg-[#0e1218]/90 px-3 py-2 text-[11px] backdrop-blur">
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
        <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded border border-[#f5c542]/40 bg-[#0e1218]/90 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#f5c542]">
          Demo region placeholder
        </div>
      )}
    </div>
  );
}
