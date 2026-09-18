import type { FeedComponent, WindTick } from "@/lib/schema";
import { feedDisplay, type FeedDisplay } from "@/lib/ui/status";

/** Judge-facing degrade line — never interpolate BigQuery / timeout internals. */
export const WIND_FALLBACK_DETAIL = "Wind · fallback";

/** Forced-down / empty-vector line (test hook and hard adapter failure). */
export const WIND_OFFLINE_DETAIL = "Wind · offline";

/** Cyan overlay — live WeatherNext cells only. */
export const WIND_LIVE_COLOR = "#3DB9FF";

/** Muted overlay for fixture / fallback vectors. */
export const WIND_FALLBACK_COLOR = "#8B9BB8";

const INTERNAL_WIND_DETAIL =
  /bigquery|timeout|job did not complete|http\s*\d{3}|permission|not found|oauth|gcp\s*token|bytes billed|aborted|service-account/i;

export function isLiveWeatherNextWind(
  wind: Pick<WindTick, "source"> | WindTick["source"],
): boolean {
  const source = typeof wind === "string" ? wind : wind.source;
  return source === "WEATHERNEXT";
}

/**
 * Wind feed chrome (dot + label). LIVE / ok only when cells are WEATHERNEXT.
 * Fixture · MOCK_WIND · IOT_WIND · empty / ok-without-WEATHERNEXT → degraded.
 */
export function windChipFeedStatus(
  status: FeedComponent["status"],
  wind: Array<Pick<WindTick, "source">>,
): FeedComponent["status"] {
  if (status === "down") return "down";
  if (status === "ok" && wind.some((w) => isLiveWeatherNextWind(w))) return "ok";
  return "degraded";
}

/** TopBar chip: LIVE only when cached WEATHERNEXT cells are on the incident. */
export function windChipDisplay(
  status: FeedComponent["status"],
  wind: Array<Pick<WindTick, "source">>,
): FeedDisplay {
  return feedDisplay(windChipFeedStatus(status, wind));
}

export function windOverlayColor(
  wind: Pick<WindTick, "source"> | WindTick["source"],
): string {
  return isLiveWeatherNextWind(wind) ? WIND_LIVE_COLOR : WIND_FALLBACK_COLOR;
}

/**
 * Banner / tooltip copy for the wind feed. Raw GCP errors stay in Worker logs.
 * Live success (`ok`) keeps Experimental cell counts; everything else is short.
 */
export function publicWindBannerDetail(
  status: FeedComponent["status"],
  detail: string,
): string {
  if (status === "ok") return detail;
  if (status === "down") return WIND_OFFLINE_DETAIL;
  if (INTERNAL_WIND_DETAIL.test(detail) || !detail.trim()) {
    return WIND_FALLBACK_DETAIL;
  }
  return WIND_FALLBACK_DETAIL;
}
