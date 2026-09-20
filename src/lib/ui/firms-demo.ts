import type { Hotspot, IncidentEvent } from "@/lib/schema";

/** Map legend chip copy — judges must see fixture hotspots are not live FIRMS. */
export const FIRMS_DEMO_CHIP_LABEL = "Hotspots · DEMO FIXTURE";

/** Compact honesty token for the feed-age line (`FIRMS · 4m ago · DEMO FIXTURE`). */
export const FIRMS_DEMO_STATUS = "DEMO FIXTURE";

/** First line of a hotspot popup when the FIRMS feed is on the remapped fixture. */
export const FIRMS_DEMO_POPUP_LINE = "Demo fixture · not live FIRMS";

/**
 * True when Ops is plotting the AegisFire-01 fixture (quiet day / 0 live rows /
 * missing key / adapter failure), not live NASA FIRMS detections.
 *
 * Live rows always carry `source: "NASA_FIRMS"`; fixture fallback rows carry
 * `NASA_FIRMS_FIXTURE`. Cascade ↔ El Salvador remap keeps those source tags.
 */
export function isFirmsDemoFixture(
  incident: Pick<IncidentEvent, "hotspots" | "feedHealth">,
): boolean {
  if (incident.hotspots.some((h) => h.source === "NASA_FIRMS")) {
    return false;
  }
  if (incident.hotspots.some((h) => h.source === "NASA_FIRMS_FIXTURE")) {
    return true;
  }
  const firms = incident.feedHealth.feeds.find((f) => f.id === "firms");
  return /fixture/i.test(firms?.detail ?? "");
}

export function hotspotPopupHtml(
  hotspot: Hotspot,
  firmsIsFixture: boolean,
): string {
  const demoLine = firmsIsFixture
    ? `<div style="color:#FFB020">${FIRMS_DEMO_POPUP_LINE}</div>`
    : "";
  return `<div style="font-family:ui-monospace,monospace">
            ${demoLine}
            <div style="color:#FF4D2E">${hotspot.eventId}</div>
            <div>${hotspot.confidence} · ${hotspot.brightnessK.toFixed(0)} K</div>
          </div>`;
}
