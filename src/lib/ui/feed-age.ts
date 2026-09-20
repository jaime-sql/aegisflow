import type { IncidentEvent } from "@/lib/schema";
import { FIRMS_DEMO_STATUS, isFirmsDemoFixture } from "@/lib/ui/firms-demo";
import {
  WIND_FALLBACK_DETAIL,
  WIND_OFFLINE_DETAIL,
  windChipFeedStatus,
} from "@/lib/ui/wind-feed";

/** Honesty suffix — never pair with a FIRMS fixture plot. */
export const FIRMS_LIVE_LABEL = "LIVE";

export { FIRMS_DEMO_STATUS };

export type FirmsHonesty = typeof FIRMS_LIVE_LABEL | typeof FIRMS_DEMO_STATUS;
export type WindHonesty = "LIVE" | "fallback" | "offline";

export type FeedAgeParts = {
  firmsAge: string | null;
  firmsHonesty: FirmsHonesty;
  windHonesty: WindHonesty;
  /** One judge-facing line, e.g. `FIRMS · 4m ago · DEMO FIXTURE · Wind · fallback`. */
  text: string;
};

/**
 * Relative age for the feed-age line. Floor to the largest whole unit
 * (`4m ago`, `10d ago`). Sub-15s is `just now` so a fresh live pull does not
 * flicker `0s ago`.
 */
export function formatRelativeAge(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const delta = Math.max(0, nowMs - then);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 15) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** FIRMS feed clock: lastSuccessAt, else newest hotspot observation. */
export function firmsAgeTimestamp(
  incident: Pick<IncidentEvent, "hotspots" | "feedHealth">,
): string | null {
  const firms = incident.feedHealth.feeds.find((f) => f.id === "firms");
  if (firms?.lastSuccessAt) return firms.lastSuccessAt;
  const observed = incident.hotspots
    .map((h) => h.observedAt)
    .filter((at): at is string => Boolean(at))
    .sort();
  return observed.at(-1) ?? null;
}

/**
 * LIVE only when the map is plotting live NASA_FIRMS (not the demo fixture).
 * Fixture / quiet-day / missing-key fallback is always DEMO FIXTURE.
 */
export function firmsHonesty(
  incident: Pick<IncidentEvent, "hotspots" | "feedHealth">,
): FirmsHonesty {
  return isFirmsDemoFixture(incident) ? FIRMS_DEMO_STATUS : FIRMS_LIVE_LABEL;
}

/**
 * LIVE only when windChipFeedStatus is ok (WEATHERNEXT cells on the incident).
 * MOCK_WIND / IOT_WIND / empty → fallback. Forced-down → offline.
 */
export function windHonesty(
  incident: Pick<IncidentEvent, "wind" | "feedHealth">,
): WindHonesty {
  const wind = incident.feedHealth.feeds.find((f) => f.id === "wind");
  const status = windChipFeedStatus(wind?.status ?? "degraded", incident.wind);
  if (status === "down") return "offline";
  if (status === "ok") return "LIVE";
  return "fallback";
}

function windAgeLabel(honesty: WindHonesty): string {
  if (honesty === "LIVE") return "Wind · LIVE";
  if (honesty === "offline") return WIND_OFFLINE_DETAIL;
  return WIND_FALLBACK_DETAIL;
}

/** One line under the legend chips. Never claims LIVE on fixture / fallback. */
export function feedAgeParts(
  incident: Pick<IncidentEvent, "hotspots" | "wind" | "feedHealth">,
  nowMs: number = Date.now(),
): FeedAgeParts {
  const firmsAge = formatRelativeAge(firmsAgeTimestamp(incident), nowMs);
  const firmsH = firmsHonesty(incident);
  const windH = windHonesty(incident);
  const firms =
    firmsAge !== null
      ? `FIRMS · ${firmsAge} · ${firmsH}`
      : `FIRMS · ${firmsH}`;
  return {
    firmsAge,
    firmsHonesty: firmsH,
    windHonesty: windH,
    text: `${firms} · ${windAgeLabel(windH)}`,
  };
}

export function feedAgeLine(
  incident: Pick<IncidentEvent, "hotspots" | "wind" | "feedHealth">,
  nowMs: number = Date.now(),
): string {
  return feedAgeParts(incident, nowMs).text;
}
