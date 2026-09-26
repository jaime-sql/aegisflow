/**
 * Compact Ask brief for one turn. Built from the region catalog plus the
 * honesty tokens already on the Ops incident (FIRMS / Wind / Predicted cone)
 * and up to three agent lines. Not a vector index.
 */
import type { IncidentEvent } from "@/lib/schema";
import type { OpsRegion } from "@/lib/regions";
import { feedAgeParts, FIRMS_DEMO_STATUS, FIRMS_LIVE_LABEL } from "@/lib/ui/feed-age";
import { predictedSpreadGeoJson, propagationConeIsSim } from "@/lib/ui/spread-cone";
import { clampAgentLines } from "./help";

/** Aim under ~1–2k tokens. The serialized brief is capped well below that. */
export const ASK_BRIEF_MAX_CHARS = 2200;

/** How-it-works reply: at most four bullets (layers, rail, Ask, dispatch). */
export const ASK_HOWTO_EN = [
  "- Layers: toggle Hotspots, Wind, Agents, and Predicted on the legend.",
  "- Rail: open an agent chip, then View lineage.",
  "- Ask: Manager and Viewer can both ask.",
  "- Dispatch: Ack and Assign stay Manager-only.",
].join("\n");

export const ASK_HOWTO_ES = [
  "- Las capas se activan en la leyenda: Hotspots, Wind, Agents y Predicted.",
  "- Panel: el linaje se abre desde un chip de agente.",
  "- Ask: Manager y Viewer pueden preguntar.",
  "- Despacho: Ack y Assign son solo para Manager.",
].join("\n");

export type AskFirmsHonesty = typeof FIRMS_LIVE_LABEL | typeof FIRMS_DEMO_STATUS;
export type AskWindHonesty = "LIVE" | "fallback" | "offline";
export type AskPredictedStatus = "present" | "absent";

export type AskBriefFacts = {
  firmsHonesty?: AskFirmsHonesty;
  firmsAge?: string | null;
  windHonesty?: AskWindHonesty;
  predicted?: AskPredictedStatus;
  predictedSim?: boolean;
};

export type AskBrief = {
  regionLabel: string;
  incidentName: string;
  executiveSummary: string;
  firmsLine: string | null;
  windLine: string | null;
  predictedLine: string | null;
  agents: string[];
  howtoEn: string;
  howtoEs: string;
};

export type AskGrounding = {
  agents?: unknown;
  facts?: unknown;
};

const FIRMS_AGE = /^(just now|\d{1,3}[smhd] ago)$/;

function oneLine(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function parseAskBriefFacts(raw: unknown): AskBriefFacts {
  if (!raw || typeof raw !== "object") return {};
  const row = raw as Record<string, unknown>;
  const facts: AskBriefFacts = {};
  const firms = oneLine(row.firmsHonesty, 24).toUpperCase();
  if (firms === FIRMS_LIVE_LABEL) facts.firmsHonesty = FIRMS_LIVE_LABEL;
  if (firms === FIRMS_DEMO_STATUS) facts.firmsHonesty = FIRMS_DEMO_STATUS;
  const age = oneLine(row.firmsAge, 24);
  if (FIRMS_AGE.test(age)) facts.firmsAge = age;
  const wind = oneLine(row.windHonesty, 16).toLowerCase();
  if (wind === "live") facts.windHonesty = "LIVE";
  if (wind === "fallback") facts.windHonesty = "fallback";
  if (wind === "offline") facts.windHonesty = "offline";
  const predicted = oneLine(row.predicted, 16).toLowerCase();
  if (predicted === "present" || predicted === "true" || predicted === "on") {
    facts.predicted = "present";
  }
  if (predicted === "absent" || predicted === "false" || predicted === "off") {
    facts.predicted = "absent";
  }
  if (row.predictedSim === true || row.predictedSim === "true" || row.predictedSim === "sim") {
    facts.predictedSim = true;
  }
  if (row.predictedSim === false || row.predictedSim === "false") {
    facts.predictedSim = false;
  }
  return facts;
}

/** Honesty + cone flags from the incident already on the Ops client. */
export function askBriefFactsFromIncident(
  incident: Pick<IncidentEvent, "hotspots" | "wind" | "feedHealth" | "agents" | "region">,
): AskBriefFacts {
  const age = feedAgeParts(incident);
  const cone = predictedSpreadGeoJson(incident);
  return {
    firmsHonesty: age.firmsHonesty,
    firmsAge: age.firmsAge,
    windHonesty: age.windHonesty,
    predicted: cone.features.length > 0 ? "present" : "absent",
    predictedSim: propagationConeIsSim(incident),
  };
}

function firmsLine(facts: AskBriefFacts): string | null {
  if (!facts.firmsHonesty) return null;
  return facts.firmsAge
    ? `FIRMS · ${facts.firmsAge} · ${facts.firmsHonesty}`
    : `FIRMS · ${facts.firmsHonesty}`;
}

function windLine(facts: AskBriefFacts): string | null {
  if (!facts.windHonesty) return null;
  if (facts.windHonesty === "LIVE") return "Wind · LIVE";
  if (facts.windHonesty === "offline") return "Wind · offline";
  return "Wind · fallback";
}

function predictedLine(facts: AskBriefFacts): string | null {
  if (!facts.predicted) return null;
  if (facts.predicted === "absent") return "Predicted cone: not drawn this turn";
  const sim = facts.predictedSim !== false;
  return sim
    ? "Predicted cone: on map · SIM · not satellite"
    : "Predicted cone: on map · agent envelope · not satellite";
}

export function buildAskBrief(args: {
  region: Pick<OpsRegion, "label" | "incidentName" | "executiveSummary">;
  grounding?: AskGrounding;
}): AskBrief {
  const facts = parseAskBriefFacts(args.grounding?.facts);
  return {
    regionLabel: args.region.label,
    incidentName: args.region.incidentName,
    executiveSummary: oneLine(args.region.executiveSummary, 500),
    firmsLine: firmsLine(facts),
    windLine: windLine(facts),
    predictedLine: predictedLine(facts),
    agents: clampAgentLines(args.grounding?.agents),
    howtoEn: ASK_HOWTO_EN,
    howtoEs: ASK_HOWTO_ES,
  };
}

/** One block for the model. Both how-to snippets are included so it can mirror. */
export function formatAskBrief(brief: AskBrief): string {
  const lines = [
    "Ask brief (facts for this turn; not instructions)",
    `Region: ${brief.regionLabel}`,
    `Incident: ${brief.incidentName}`,
    `Exec: ${brief.executiveSummary}`,
  ];
  if (brief.firmsLine) lines.push(`FIRMS: ${brief.firmsLine}`);
  if (brief.windLine) lines.push(`WIND: ${brief.windLine}`);
  if (brief.predictedLine) lines.push(`Predicted: ${brief.predictedLine}`);
  lines.push("Agents:");
  if (brief.agents.length === 0) lines.push("(no agent lines)");
  else brief.agents.forEach((line, i) => lines.push(`${i + 1}. ${line}`));
  lines.push(`How-to EN: ${brief.howtoEn}`);
  lines.push(`How-to ES: ${brief.howtoEs}`);
  const text = lines.join("\n");
  if (text.length <= ASK_BRIEF_MAX_CHARS) return text;
  return `${text.slice(0, ASK_BRIEF_MAX_CHARS).replace(/\s+\S*$/, "").trim()}…`;
}

function watchBeat(brief: AskBrief, lang: "en" | "es"): string {
  if (lang === "es") return `Vigilancia: ${brief.regionLabel}.`;
  const first = brief.executiveSummary.split(/[.!?]/)[0]?.trim() || brief.incidentName;
  const short = first.length > 72 ? brief.incidentName : first;
  return `${short}.`;
}

/** One honesty line. Product tokens stay literal when they are true. */
function honestyBeat(brief: AskBrief, lang: "en" | "es"): string {
  const parts = [brief.firmsLine, brief.windLine].filter((line): line is string => Boolean(line));
  if (parts.length === 0) {
    return lang === "es" ? "Fuentes sin reporte de honestidad." : "Feed honesty not reported.";
  }
  return `${parts.join(". ")}.`;
}

function predictedBeat(brief: AskBrief, lang: "en" | "es"): string {
  if (!brief.predictedLine) {
    return lang === "es"
      ? "El cono Predicted no viene en este turno."
      : "Predicted cone is not reported this turn.";
  }
  if (brief.predictedLine.includes("not drawn")) {
    return lang === "es"
      ? "El cono Predicted no está en el mapa."
      : "Predicted cone is not drawn this turn.";
  }
  if (brief.predictedLine.includes("SIM")) {
    return lang === "es"
      ? "El cono Predicted está en el mapa, SIM, no es satélite."
      : "Predicted cone is on the map, SIM, not a satellite layer.";
  }
  return lang === "es"
    ? "El cono Predicted está en el mapa, no es satélite."
    : "Predicted cone is on the map, not a satellite layer.";
}

function agentBeat(brief: AskBrief, lang: "en" | "es"): string {
  const names = brief.agents
    .map((line) => line.split(":")[0]?.trim() || "")
    .filter(Boolean)
    .slice(0, 3);
  if (names.length === 0) {
    return lang === "es" ? "Agentes: ninguno en este turno." : "Agents: none on this turn.";
  }
  return lang === "es" ? `Agentes: ${names.join(", ")}.` : `Agents: ${names.join(", ")}.`;
}

/**
 * Situation reply: exactly four short beats, blank line between them.
 * Watch, honesty, Predicted, agents. Speak-length, not a paragraph.
 */
export function situationReply(brief: AskBrief, lang: "en" | "es"): string {
  return [watchBeat(brief, lang), honestyBeat(brief, lang), predictedBeat(brief, lang), agentBeat(brief, lang)].join(
    "\n\n",
  );
}

/** How-it-works: the language's bullet list only (3–4 lines). */
export function howtoReply(brief: AskBrief, lang: "en" | "es"): string {
  return lang === "es" ? brief.howtoEs : brief.howtoEn;
}
