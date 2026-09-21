import type { OpsRegion } from "@/lib/regions";
import { OPS_ASK_HELP } from "./help";

export type FaqTopic =
  | "layers"
  | "lineage"
  | "roles"
  | "region"
  | "feeds"
  | "speak"
  | "situation"
  | "help"
  | "scope";

const FAQ_COPY: Record<Exclude<FaqTopic, "situation">, string> = {
  layers:
    "Map layers are Hotspots, Wind, and Agents. Toggle them on the legend. Hotspots are NASA FIRMS or a DEMO FIXTURE. Wind is Experimental WeatherNext 10 m, or Wind · fallback when the cache is stale. Feed age stays honest.",
  lineage:
    "Open an agent chip in the right rail, then View lineage. The drawer cites the same hotspot and wind eventIds the map is plotting. Agents are Propagation, Evacuation, and Resources.",
  roles:
    "Manager and Viewer both see Ops, Ask, and Brief aloud. Ack and Assign stay Manager-only. Viewer sees those dispatch actions locked.",
  region:
    "The region picker switches El Salvador / WUI (default) and Cascade (AegisFire-01) on the same map. It does not open a second map.",
  feeds:
    "Primary feeds are FIRMS, WeatherNext wind, and crowdsource. RF and Edge stay SIM. A degraded feed shows on the banner. Ops does not go blank.",
  speak:
    "Brief aloud on the exec summary plays a short clip for Manager and Viewer. Speak answer reads only the latest Ask reply and stops at the daily limit. A missing ElevenLabs key shows muted SIM.",
  help: `Ask about layers, lineage, roles, region, or feeds. ${OPS_ASK_HELP}`,
  scope:
    "Ask Ops only covers this incident and how to use Ops (layers, lineage, roles, region, feeds).",
};

function has(q: string, pattern: RegExp): boolean {
  return pattern.test(q);
}

export function classifyAskQuestion(question: string): FaqTopic {
  const q = question.toLowerCase();
  if (has(q, /\blayers?\b|\bhotspots?\b|\blegend\b|\btoggle\b|\boverlay\b/)) return "layers";
  if (has(q, /\blineage\b|\bagents?\b|\bchips?\b|\bpropagation\b|\bevacuation\b/)) {
    return "lineage";
  }
  if (has(q, /\broles?\b|\bviewer\b|\bmanager\b|\bdispatch\b|\back\b|\bassign\b/)) {
    return "roles";
  }
  if (has(q, /\bregions?\b|\bpicker\b|el salvador|\bcascade\b|\bbbox\b/)) return "region";
  if (
    has(
      q,
      /\bfeeds?\b|\bfirms\b|\bweathernext\b|\bwind\b|\bdegraded\b|\bexperimental\b|\bcrowdsource\b|\brf\b|\bedge\b/,
    )
  ) {
    return "feeds";
  }
  if (has(q, /\bbrief\b|\bspeak\b|\baloud\b|\belevenlabs\b/)) return "speak";
  if (
    has(
      q,
      /\bsituation\b|\bsummary\b|\bstatus\b|\bincident\b|\bhappening\b|\bwatch\b|\bfire\b/,
    )
  ) {
    return "situation";
  }
  if (has(q, /\bhelp\b|\bhow do i\b|\bhow to\b|\buse ops\b/)) return "help";
  return "scope";
}

/** Static FAQ used when both model keys are empty or the live calls fail. */
export function answerFaq(question: string, region: Pick<OpsRegion, "executiveSummary" | "label">): string {
  const topic = classifyAskQuestion(question);
  if (topic === "situation") return region.executiveSummary;
  if (topic === "region") {
    return `${FAQ_COPY.region} Current region: ${region.label}. ${region.executiveSummary}`;
  }
  return FAQ_COPY[topic];
}
