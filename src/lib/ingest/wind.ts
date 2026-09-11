import type { FeedComponent, WindTick } from "@/lib/schema";
import { SCHEMA_VERSION } from "@/lib/schema";
import { loadFixtureIncident } from "@/lib/fixtures/aegisfire-01";

export type WindResult = {
  wind: WindTick[];
  health: FeedComponent;
};

type Center = { lat: number; lon: number };

function mockField(center: Center, at: string): WindTick[] {
  const offsets: Array<[number, number, number, number]> = [
    [-0.02, -0.08, 12.4, 242],
    [0.01, -0.04, 11.1, 248],
    [-0.03, 0.01, 9.6, 236],
    [0.03, -0.02, 13.2, 251],
    [-0.05, -0.11, 10.4, 239],
    [0.02, 0.04, 8.8, 244],
  ];

  return offsets.map((row, i) => {
    const [dLat, dLon, speed, dir] = row;
    const tick: WindTick = {
      eventId: `evt_aegisfire01_wind_${String(i + 1).padStart(2, "0")}`,
      schemaVersion: SCHEMA_VERSION,
      lat: center.lat + dLat,
      lon: center.lon + dLon,
      speedMps: speed,
      directionDeg: dir,
      gustMps: Number((speed * 1.45).toFixed(1)),
      observedAt: at,
      source: "MOCK_WIND",
    };
    return tick;
  });
}

/**
 * Stage 1 wind adapter: deterministic mock vectors.
 * Swap for live IoT later; throw/degrade is isolated from FIRMS.
 */
export async function fetchWindTicks(center: Center): Promise<WindResult> {
  const now = new Date().toISOString();
  try {
    if (process.env.AEGISFLOW_FAIL_WIND === "true") {
      throw new Error("forced wind adapter failure");
    }
    const fixture = loadFixtureIncident();
    const wind = fixture.wind.length ? fixture.wind : mockField(center, now);
    return {
      wind,
      health: {
        id: "wind",
        label: "Wind / IoT",
        status: "ok",
        detail: "Mock vector field — Stage 1",
        lastSuccessAt: wind[0]?.observedAt ?? now,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown wind error";
    return {
      wind: [],
      health: {
        id: "wind",
        label: "Wind / IoT",
        status: "down",
        detail: `Wind adapter failed (${message}) — map continues without vectors`,
        lastSuccessAt: null,
      },
    };
  }
}
