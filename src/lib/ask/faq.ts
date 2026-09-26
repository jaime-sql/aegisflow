import type { OpsRegion } from "@/lib/regions";
import {
  GREETING_EN,
  GREETING_ES,
  LANGUAGE_EN,
  LANGUAGE_ES,
  REFUSE_EN,
  REFUSE_ES,
} from "./copy";
import { OPS_ASK_HELP } from "./help";
import {
  askReplyLanguage,
  isLanguageMeta,
  isShortGreeting,
  type AskReplyLanguage,
} from "./language";

export type FaqTopic =
  | "layers"
  | "lineage"
  | "roles"
  | "region"
  | "feeds"
  | "speak"
  | "situation"
  | "help"
  | "greeting"
  | "scope";

const FAQ_COPY: Record<Exclude<FaqTopic, "situation" | "greeting">, string> = {
  layers:
    "Map layers are Hotspots, Wind, Agents, and Predicted. Toggle them on the legend. Predicted is the agent spread cone, labeled Predicted, and is not a satellite layer. Hotspots are NASA FIRMS or a DEMO FIXTURE. Wind is Experimental WeatherNext 10 m, or Wind · fallback when the cache is stale. Wind Live is WeatherNext only. Feed age stays honest.",
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
  scope: REFUSE_EN,
};

const FAQ_ES: Record<Exclude<FaqTopic, "situation" | "greeting" | "scope">, string> = {
  layers:
    "Las capas del mapa son Hotspots, Wind, Agents y Predicted. Se activan en la leyenda. Predicted es el cono de propagación del agente, no una capa satelital. Hotspots son NASA FIRMS o un DEMO FIXTURE. Wind es Experimental WeatherNext 10 m, o Wind · fallback si la caché está vieja. Wind Live es solo WeatherNext.",
  lineage:
    "Abre un chip de agente en el panel derecho y luego View lineage. El panel cita los mismos eventIds de hotspot y viento que dibuja el mapa. Los agentes son Propagation, Evacuation y Resources.",
  roles:
    "Manager y Viewer ven Ops, Ask y Brief aloud. Ack y Assign siguen siendo solo para Manager. Viewer ve esas acciones de despacho bloqueadas.",
  region:
    "El selector de región cambia El Salvador / WUI (predeterminado) y Cascade (AegisFire-01) en el mismo mapa. No abre un segundo mapa.",
  feeds:
    "Las fuentes principales son FIRMS, viento WeatherNext y crowdsource. RF y Edge siguen en SIM. Una fuente degradada se muestra en el banner. Ops no se queda en blanco.",
  speak:
    "Brief aloud en el resumen ejecutivo reproduce un clip corto para Manager y Viewer. Speak answer lee solo la última respuesta de Ask y se detiene en el límite diario. Sin clave de ElevenLabs se muestra SIM en silencio.",
  help: "Pregunta sobre capas, linaje, roles, región o fuentes. Las capas se activan en la leyenda. El linaje se abre desde un chip de agente. Ack y Assign son solo para Manager. El selector cambia El Salvador / WUI y Cascade en el mismo mapa.",
};

function has(q: string, pattern: RegExp): boolean {
  return pattern.test(q);
}

export function classifyAskQuestion(question: string): FaqTopic {
  const q = question.toLowerCase();
  if (isLanguageMeta(q)) return "greeting";
  if (has(q, /\blayers?\b|\bhotspots?\b|\blegend\b|\btoggle\b|\boverlay\b|\bcapas?\b|\bleyenda\b/)) {
    return "layers";
  }
  if (
    has(
      q,
      /\blineage\b|\blinaje\b|\bagents?\b|\bagentes?\b|\bchips?\b|\bpropagation\b|\bpropagaci[oó]n\b|\bevacuation\b|\bevacuaci[oó]n\b/,
    )
  ) {
    return "lineage";
  }
  if (
    has(
      q,
      /\broles?\b|\bviewer\b|\bmanager\b|\bdispatch\b|\bdespacho\b|\back\b|\bassign\b|\basignar\b|\bgerente\b/,
    )
  ) {
    return "roles";
  }
  if (has(q, /\bregi[oó]ns?\b|\bregiones\b|\bpicker\b|\bselector\b|el salvador|\bcascade\b|\bbbox\b/)) {
    return "region";
  }
  if (
    has(
      q,
      /\bfeeds?\b|\bfuentes?\b|\bfirms\b|\bweathernext\b|\bwind\b|\bviento\b|\bdegraded\b|\bexperimental\b|\bcrowdsource\b|\brf\b|\bedge\b/,
    )
  ) {
    return "feeds";
  }
  if (has(q, /\bbrief\b|\bspeak\b|\baloud\b|\belevenlabs\b|\ben voz alta\b/)) return "speak";
  if (
    has(
      q,
      /\bsituation\b|\bsituaci[oó]n\b|\bsummary\b|\bstatus\b|\bincident\b|\bincidente\b|\bhappening\b|\bwatch\b|\bfire\b|\bincendio\b/,
    )
  ) {
    return "situation";
  }
  if (
    has(
      q,
      /\bhelp\b|\bayuda\b|\bhow do i\b|\bhow to\b|\buse ops\b|\bc[oó]mo uso\b|\bexplic\w*|\bc[oó]mo funciona\w*|\bfunciona\w*/,
    )
  ) {
    return "help";
  }
  if (isShortGreeting(q)) return "greeting";
  return "scope";
}

function greetingAnswer(question: string, lang: AskReplyLanguage): string {
  if (isLanguageMeta(question)) return lang === "es" ? LANGUAGE_ES : LANGUAGE_EN;
  return lang === "es" ? GREETING_ES : GREETING_EN;
}

/** Static FAQ used when both model keys are empty or the live calls fail. */
export function answerFaq(question: string, region: Pick<OpsRegion, "executiveSummary" | "label">): string {
  const topic = classifyAskQuestion(question);
  const lang = askReplyLanguage(question);
  if (topic === "greeting") return greetingAnswer(question, lang);
  if (topic === "scope") return lang === "es" ? REFUSE_ES : FAQ_COPY.scope;
  if (topic === "situation") {
    return lang === "es"
      ? `Resumen del incidente: ${region.executiveSummary}`
      : region.executiveSummary;
  }
  if (topic === "region") {
    return lang === "es"
      ? `${FAQ_ES.region} Región actual: ${region.label}. ${region.executiveSummary}`
      : `${FAQ_COPY.region} Current region: ${region.label}. ${region.executiveSummary}`;
  }
  return lang === "es" ? FAQ_ES[topic] : FAQ_COPY[topic];
}
