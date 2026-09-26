/**
 * Browser speech-to-text for Ask Ops (Web Speech API).
 * Mic failure falls back to typed Ask. This module does not synthesize audio.
 */

export const MIC_IDLE_LABEL = "Ask with voice";
/** Denied or unsupported. Tooltip copy, not a toast. */
export const MIC_DENIED_HINT = "Mic unavailable · type instead";

/** Ask drawer recognition locale. Demo default is Spanish. */
export type MicLocale = "es" | "en";

export const DEFAULT_MIC_LOCALE: MicLocale = "es";
/** El Salvador Spanish for this demo. */
export const MIC_LANG_ES = "es-SV";
/** Used when the browser rejects es-SV. */
export const MIC_LANG_ES_FALLBACK = "es-ES";
export const MIC_LANG_EN = "en-US";

/** Tooltip while the ES chip is active. */
export const MIC_LOCALE_TITLE_ES = "Idioma del micrófono";
/** Tooltip while the EN chip is active. */
export const MIC_LOCALE_TITLE_EN = "Mic language";

export function micLocaleTitle(locale: MicLocale): string {
  return locale === "es" ? MIC_LOCALE_TITLE_ES : MIC_LOCALE_TITLE_EN;
}

/**
 * Same chip is a no-op. A change while listening stops STT and restarts
 * in the new locale. A change while idle only stores the preference.
 */
export function micLocaleSwitch(
  current: MicLocale,
  next: MicLocale,
  listening: boolean,
): "noop" | "set" | "restart" {
  if (next === current) return "noop";
  return listening ? "restart" : "set";
}

export function parseMicLocale(raw: string | null | undefined): MicLocale {
  return raw === "en" ? "en" : DEFAULT_MIC_LOCALE;
}

/** BCP-47 tag passed to SpeechRecognition.lang. */
export function micRecognitionLang(locale: MicLocale, esFallback = false): string {
  if (locale === "en") return MIC_LANG_EN;
  return esFallback ? MIC_LANG_ES_FALLBACK : MIC_LANG_ES;
}

/**
 * es-SV is the Spanish tag. If the browser reports language-not-supported,
 * retry once with es-ES. Other errors stay on the current tag.
 */
export function micLangAfterError(
  locale: MicLocale,
  esFallback: boolean,
  errorCode: string,
): { esFallback: boolean; retry: boolean } {
  if (locale === "es" && !esFallback && errorCode === "language-not-supported") {
    return { esFallback: true, retry: true };
  }
  return { esFallback, retry: false };
}

export type MicPhase = "idle" | "listening" | "error";

export type SpeechAlternativeLike = { transcript?: string };

export type SpeechResultLike = {
  0?: SpeechAlternativeLike;
};

export type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { results?: ArrayLike<SpeechResultLike> }) => void) | null;
};

export function transcriptFromResults(
  results: ArrayLike<SpeechResultLike> | null | undefined,
): string {
  if (!results) return "";
  let text = "";
  for (let i = 0; i < results.length; i++) {
    text += results[i]?.[0]?.transcript ?? "";
  }
  return text.replace(/\s+/g, " ").trim();
}

export type AutoSpeakInput = {
  /** True only when this ask was started from the mic. */
  voiceOrigin: boolean;
  configured: boolean;
  capped: boolean;
  answer: string;
};

/**
 * Auto-Speak only voice-originated asks, and only when TTS is configured
 * and the daily Speak cap still allows a clip. Typed asks return false so
 * Speak stays manual.
 */
export function shouldAutoSpeak(input: AutoSpeakInput): boolean {
  if (!input.voiceOrigin) return false;
  if (!input.configured) return false;
  if (input.capped) return false;
  return input.answer.trim().length > 0;
}

/** Idle label is the locked aria-label. Denied/unsupported uses the tooltip string. */
export function micAriaLabel(phase: MicPhase, supported: boolean): string {
  if (!supported || phase === "error") return MIC_DENIED_HINT;
  if (phase === "listening") return "Stop listening";
  return MIC_IDLE_LABEL;
}

type SpeechHost = {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

/** Standard API first, then the WebKit name Chrome still ships. */
export function speechRecognitionCtor(host: unknown): (new () => BrowserSpeechRecognition) | null {
  if (!host || typeof host !== "object") return null;
  const bag = host as SpeechHost;
  return bag.SpeechRecognition ?? bag.webkitSpeechRecognition ?? null;
}
