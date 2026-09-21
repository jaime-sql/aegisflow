/**
 * Baked-in Ops help. Ask Ops may use this plus the current exec summary and
 * up to three agent lines. It is not a web search corpus.
 */
export const OPS_ASK_HELP = [
  "Layers: the map legend toggles Hotspots (NASA FIRMS or DEMO FIXTURE), Wind (Experimental WeatherNext 10 m, or Wind · fallback), and Agents. The map stays the primary view.",
  "Lineage: open an agent chip, then View lineage. The drawer cites the same hotspot and wind eventIds drawn on the map. Agents are Propagation, Evacuation, and Resources.",
  "Roles: Manager and Viewer can use Ask and Brief aloud. Ack and Assign stay Manager-only. Viewer sees dispatch locked.",
  "Region: the picker switches El Salvador / WUI (default) and Cascade (AegisFire-01) on this same map. It is not a second map.",
  "Feeds: FIRMS, WeatherNext wind, and crowdsource. RF and Edge stay SIM. A degraded feed shows a banner; Ops does not go blank.",
  "Brief aloud plays the exec summary. Speak answer reads only the latest Ask reply.",
].join(" ");

export const ASK_AGENT_LINE_LIMIT = 3;
export const ASK_QUESTION_MAX = 400;
export const ASK_ANSWER_MAX_CHARS = 700;

export type AskAgentInput = {
  title?: unknown;
  summary?: unknown;
};

function oneLine(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** At most three short agent lines. Extra chips are dropped. */
export function clampAgentLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const lines: string[] = [];
  for (const item of raw) {
    if (lines.length >= ASK_AGENT_LINE_LIMIT) break;
    if (!item || typeof item !== "object") continue;
    const row = item as AskAgentInput;
    const title = oneLine(row.title, 80);
    const summary = oneLine(row.summary, 240);
    if (!title && !summary) continue;
    lines.push(`${title || "Agent"}: ${summary || "—"}`);
  }
  return lines;
}

export function clampQuestion(raw: unknown): string {
  return oneLine(raw, ASK_QUESTION_MAX);
}

export function clampAnswer(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= ASK_ANSWER_MAX_CHARS) return cleaned;
  const sliced = cleaned.slice(0, ASK_ANSWER_MAX_CHARS).replace(/\s+\S*$/, "").trim();
  return sliced || cleaned.slice(0, ASK_ANSWER_MAX_CHARS).trim();
}
