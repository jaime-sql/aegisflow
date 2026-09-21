import { DemoFixtureChip } from "./DemoFixtureChip";
import { ExperimentalBadge } from "./ExperimentalBadge";
import type { IncidentEvent } from "@/lib/schema";
import { FIRMS_DEMO_STATUS } from "@/lib/ui/firms-demo";
import { feedAgeParts, FIRMS_LIVE_LABEL } from "@/lib/ui/feed-age";
import {
  MAP_LAYER_KEYS,
  MAP_LAYER_LABELS,
  mapLayerCounts,
  type MapLayerKey,
  type MapLayerVisibility,
} from "@/lib/ui/map-layers";
import { isLiveWeatherNextWind } from "@/lib/ui/wind-feed";

function LayerSwatch({
  layer,
  on,
  windLive,
}: {
  layer: MapLayerKey;
  on: boolean;
  windLive: boolean;
}) {
  const dim = on ? "opacity-100" : "opacity-40";
  if (layer === "hotspots") {
    return (
      <span className={`h-2 w-2 rounded-full bg-[#FF4D2E] ${dim}`} aria-hidden />
    );
  }
  if (layer === "wind") {
    return (
      <span
        className={`h-0.5 w-3 ${dim}`}
        style={{ backgroundColor: windLive ? "#3DB9FF" : "#8B9BB8" }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`h-2 w-2 rotate-45 border-2 border-[#3DB9FF] bg-[#121A2B] ${dim}`}
      aria-hidden
    />
  );
}

/**
 * Compact map legend: Hotspots / Wind / Agents toggles with live counts,
 * then one honest feed-age line. Extra feed toggles stay out of the stack.
 * Incident dossier / judge-path chrome are follow-ups — do not add them here.
 */
export function MapLegendStack({
  incident,
  visible,
  onToggle,
  nowMs,
}: {
  incident: IncidentEvent;
  visible: MapLayerVisibility;
  onToggle: (layer: MapLayerKey) => void;
  nowMs?: number;
}) {
  const counts = mapLayerCounts(incident);
  const age = feedAgeParts(incident, nowMs);
  const windLive = incident.wind.some((w) => isLiveWeatherNextWind(w));

  return (
    <div
      data-ops-tour="map-layers"
      className="pointer-events-auto flex flex-col items-start gap-1"
    >
      <div className="rounded-md border border-[#1E2A40] bg-[#121A2B]/90 px-2 py-2 text-[11px] backdrop-blur">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8]">
          Legend
        </div>
        <div className="flex flex-wrap gap-1">
          {MAP_LAYER_KEYS.map((key) => {
            const on = visible[key];
            const count = counts[key];
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                aria-label={`${on ? "Hide" : "Show"} ${MAP_LAYER_LABELS[key]} layer, ${count} on map`}
                onClick={() => onToggle(key)}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                  on
                    ? "border-[#3DB9FF]/50 bg-[#0B1220] text-[#E8EEF9]"
                    : "border-[#1E2A40] bg-[#0B1220]/50 text-[#8B9BB8]"
                }`}
              >
                <LayerSwatch layer={key} on={on} windLive={windLive} />
                {MAP_LAYER_LABELS[key]}
                <span className="tabular-nums text-[#8B9BB8]">{count}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[9px] leading-snug text-[#8B9BB8]">
          <span>FIRMS</span>
          <span aria-hidden>·</span>
          {age.firmsAge ? (
            <>
              <span>{age.firmsAge}</span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          {age.firmsHonesty === FIRMS_DEMO_STATUS ? (
            <DemoFixtureChip label={FIRMS_DEMO_STATUS} />
          ) : (
            <span className="text-[#3DDC97]">{FIRMS_LIVE_LABEL}</span>
          )}
          <span aria-hidden>·</span>
          <span
            className={
              age.windHonesty === "LIVE" ? "text-[#3DDC97]" : "text-[#FFB020]"
            }
          >
            {age.windHonesty === "LIVE"
              ? "Wind · LIVE"
              : age.windHonesty === "offline"
                ? "Wind · offline"
                : "Wind · fallback"}
          </span>
        </p>
        <div className="mt-1">
          <ExperimentalBadge label="WeatherNext" />
        </div>
      </div>
    </div>
  );
}
