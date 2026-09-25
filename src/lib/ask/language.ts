/**
 * Ask language for the live prompt and the SIM FAQ.
 * Spanish is detected with a small signal list. Other asks stay English.
 */

export type AskReplyLanguage = "en" | "es";

const SPANISH_SIGNAL =
  /[áéíóúüñ¿¡]|\b(hola|gracias|por favor|buenos|buenas|d[ií]as|tardes|noches|c[oó]mo|qu[eé]|cu[aá]l|puedes|puede|puedo|hablo|hablas|habla|hablar|espa[nñ]ol|espanol|capas?|linaje|despacho|situaci[oó]n|ayuda|ayudarte|necesito|necesitas|quisiera|viento|leyenda|fuentes?|incendio|d[oó]nde|tambi[eé]n|agentes?|propagaci[oó]n|evacuaci[oó]n|aqu[ií]|estoy|claro)\b/i;

export function textLooksSpanish(text: string): boolean {
  return SPANISH_SIGNAL.test(text);
}

const LANGUAGE_ASK =
  /\b(speak|hablas?|hablar|language|idioma|puedes|puede|can you|do you|sabes)\b/i;

function mentionsSpanish(question: string): boolean {
  return /\b(spanish|espa[nñ]ol|espanol)\b/i.test(question);
}

function mentionsEnglish(question: string): boolean {
  return /\b(english|ingl[eé]s|ingles)\b/i.test(question);
}

/** “Can you speak Spanish?” / “¿hablas español?” — not the Speak-answer control. */
export function isLanguageMeta(question: string): boolean {
  if (!LANGUAGE_ASK.test(question)) return false;
  return mentionsSpanish(question) || mentionsEnglish(question);
}

function asksInSpanish(question: string): boolean {
  return /\b(in spanish|en espa[nñ]ol|en espanol)\b/i.test(question);
}

/**
 * Language the reply should use.
 * A request to speak Spanish locks Spanish even when the ask is in English.
 */
export function askReplyLanguage(question: string): AskReplyLanguage {
  if (isLanguageMeta(question)) {
    const es = mentionsSpanish(question);
    const en = mentionsEnglish(question);
    if (es && !en) return "es";
    if (en && !es) return "en";
  }
  if (asksInSpanish(question) || SPANISH_SIGNAL.test(question)) return "es";
  return "en";
}

const GREETING_EXACT = new Set([
  "hi",
  "hey",
  "hello",
  "hola",
  "buenas",
  "buenos dias",
  "buenos días",
  "buenas tardes",
  "buenas noches",
  "good morning",
  "good afternoon",
  "good evening",
  "good day",
  "thanks",
  "thank you",
  "gracias",
  "ok",
  "okay",
  "yes",
  "yeah",
  "yo",
  "si",
  "sí",
]);

export function normalizeAskText(question: string): string {
  return question
    .toLowerCase()
    .replace(/[¿¡?!.,;:'"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Short greetings only. An Ops keyword later in classify wins over this. */
export function isShortGreeting(question: string): boolean {
  const trimmed = normalizeAskText(question);
  if (!trimmed || trimmed.length > 48) return false;
  if (GREETING_EXACT.has(trimmed)) return true;
  const words = trimmed.split(" ");
  if (words.length > 4) return false;
  return /^(hi|hey|hello|hola|buenas|buenos|good|thanks|thank|gracias|ok|okay)\b/.test(trimmed);
}
