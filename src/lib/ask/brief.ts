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

export const ASK_HOWTO_EN =
  "Layers: legend toggles for Hotspots, Wind, Agents, and Predicted (the agent spread cone, not a satellite layer). Lineage: open an agent chip, then View lineage — same hotspot and wind eventIds as the map. Roles: Manager and Viewer can Ask; Ack and Assign stay Manager-only. Region·feeds: the picker switches El Salvador / WUI and Cascade on this map; feeds are FIRMS, WeatherNext wind, and crowdsource (RF and Edge stay SIM).";

export const ASK_HOWTO_ES =
  "Las capas se activan en la leyenda (Hotspots, Wind, Agents y Predicted, el cono del agente, no una capa satelital). El linaje se abre desde un chip de agente y luego View lineage; cita los mismos eventIds del mapa. Roles: Manager y Viewer pueden usar Ask; Ack y Assign son solo para Manager. Región·fuentes: el selector cambia El Salvador / WUI y Cascade en este mapa; las fuentes son FIRMS, viento WeatherNext y crowdsource (RF y Edge siguen en SIM).";

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

function predictedSentence(brief: AskBrief, lang: "en" | "es"): string | null {
  if (!brief.predictedLine) return null;
  const absent = brief.predictedLine.includes("not drawn");
  const sim = brief.predictedLine.includes("SIM");
  if (lang === "es") {
    if (absent) return "El cono Predicted no está dibujado en este turno.";
    return sim
      ? "El cono Predicted está en el mapa (SIM, no es satélite)."
      : "El cono Predicted está en el mapa (sobre del agente, no es satélite).";
  }
  if (absent) return "Predicted cone is not drawn this turn.";
  return sim
    ? "Predicted cone is on the map (SIM, not a satellite layer)."
    : "Predicted cone is on the map (agent envelope, not a satellite layer).";
}

function honestySentences(brief: AskBrief, lang: "en" | "es"): string[] {
  const lines: string[] = [];
  if (brief.firmsLine) {
    lines.push(lang === "es" ? `Hotspots: ${brief.firmsLine}.` : `${brief.firmsLine}.`);
  }
  if (brief.windLine) {
    lines.push(lang === "es" ? `Viento: ${brief.windLine}.` : `${brief.windLine}.`);
  }
  const predicted = predictedSentence(brief, lang);
  if (predicted) lines.push(predicted);
  return lines;
}

/** Friendly situation reply. Spanish keeps the locked "Resumen del incidente" lead-in. */
export function situationReply(brief: AskBrief, lang: "en" | "es"): string {
  const honesty = honestySentences(brief, lang);
  const agents =
    brief.agents.length === 0
      ? ""
      : lang === "es"
        ? `Agentes: ${brief.agents.join(" ")}`
        : `Agents: ${brief.agents.join(" ")}`;
  if (lang === "es") {
    return [
      `Te cuento lo que está pasando en ${brief.regionLabel}.`,
      ...honesty,
      `Resumen del incidente: ${brief.executiveSummary}`,
      agents,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `Here's what is happening on ${brief.regionLabel}.`,
    ...honesty,
    brief.executiveSummary,
    agents,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Ops how-to in the ask language, plus the live honesty lines when we have them. */
export function howtoReply(brief: AskBrief, lang: "en" | "es"): string {
  const honesty = honestySentences(brief, lang);
  if (lang === "es") {
    return [`Así funciona esto en ${brief.regionLabel}.`, brief.howtoEs, ...honesty].join(" ");
  }
  return [`Here's how this works on ${brief.regionLabel}.`, brief.howtoEn, ...honesty].join(" ");
}
