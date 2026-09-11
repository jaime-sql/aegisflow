"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Hotspot, IncidentEvent, WindTick } from "@/lib/schema";
import { PUBLIC_CROWD_COPY } from "@/lib/pii";
import { withBasePath } from "@/lib/base-path";
import { SimBadge } from "./SimBadge";

const leafletIconPath = withBasePath("/leaflet");

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

export function OpsMap({ incident }: { incident: IncidentEvent }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

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
    }).setView([incident.region.center.lat, incident.region.center.lon], 11);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      subdomains: "abc",
      className: "ops-dark-tiles",
      maxZoom: 19,
    }).addTo(map);

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
      .addTo(map);

    for (const h of incident.hotspots) {
      L.circleMarker([h.lat, h.lon], {
        radius: 5 + Math.min(h.brightnessK / 80, 8),
        color: "#1a0e08",
        weight: 1,
        fillColor: hotspotColor(h.confidence),
        fillOpacity: 0.9,
      })
        .bindPopup(
          `<div style="font-family:ui-monospace,monospace">
            <div style="color:#FF4D2E">${h.eventId}</div>
            <div>${h.confidence} · ${h.brightnessK.toFixed(0)} K</div>
          </div>`,
        )
        .addTo(map);
    }

    for (const w of incident.wind) {
      const dest = windDest(w);
      L.polyline([[w.lat, w.lon], dest], {
        color: "#3DB9FF",
        weight: 2,
        opacity: 0.9,
      }).addTo(map);
      L.circleMarker(dest, {
        radius: 3,
        color: "#3DB9FF",
        fillColor: "#3DB9FF",
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
        color: "#3DB9FF",
        weight: 2,
        fillColor: "#8B9BB8",
        fillOpacity: 0.9,
      },
    )
      .bindPopup("RF / edge mesh · SIM<br/>evt_aegisfire01_tl_04")
      .addTo(map);

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
      <div className="pointer-events-none absolute bottom-8 left-3 z-[500] space-y-2">
        <div className="rounded-md border border-[#1E2A40] bg-[#121A2B]/90 px-3 py-2 text-[11px] backdrop-blur">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8]">
            Legend
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF4D2E]" /> Hotspot
          </div>
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-4 bg-[#3DB9FF]" /> Wind
          </div>
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-4 bg-[#3DDC97]" /> Corridor
          </div>
        </div>
        <div className="flex gap-1">
          <SimBadge label="RF" />
          <SimBadge label="Edge" />
        </div>
      </div>
      {incident.region.placeholder && (
        <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded border border-[#FFB020]/40 bg-[#121A2B]/90 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#FFB020]">
          Demo region placeholder
        </div>
      )}
    </div>
  );
}
