/**
 * Locked Ask Ops copy. Refusals are one short line in the ask language,
 * then the same four topics. Greetings are a warm one-liner plus an invite.
 */

export const ASK_TOPIC_LINE = "layers / lineage / roles / region·feeds";

export const REFUSE_EN = `I can help with this incident — ${ASK_TOPIC_LINE}`;
export const REFUSE_ES = `Puedo ayudarte con este incidente — ${ASK_TOPIC_LINE}`;

export const GREETING_EN = "Hi — I'm here. What do you need on this incident?";
export const GREETING_ES = "Hola, aquí estoy. ¿Qué necesitas de este incidente?";

export const LANGUAGE_EN = "Yes — I can answer in English. What do you need?";
export const LANGUAGE_ES = "Sí, hablo español. ¿Qué necesitas?";

/** Screenshot wall and close paraphrases. In-scope answers do not match. */
export function isEnglishRefuseWall(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!t) return false;
  if (/i can only assist/.test(t)) return true;
  if (/i can only provide/.test(t)) return true;
  if (/i['’]?m unable to assist/.test(t)) return true;
  if (/please ask about (those topics|map layers)/.test(t)) return true;
  if (/only covers this incident/.test(t)) return true;
  if (/including map layers, lineage, roles/.test(t)) return true;
  if (/region picker, (and|or) feeds/.test(t)) return true;
  return false;
}

export function isGreetingBlock(text: string): boolean {
  const cleaned = text.replace(/[¿¡]/g, "").replace(/\s+/g, " ").trim();
  const sentences = cleaned
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (sentences.length > 2 || cleaned.length > 180) return true;
  return /layers\s*[,/]\s*lineage/i.test(cleaned) && /\broles\b/i.test(cleaned);
}
