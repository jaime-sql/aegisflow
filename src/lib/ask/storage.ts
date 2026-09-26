import {
  ASK_SESSION_LIMIT,
  SPEAK_DAILY_CHAR_LIMIT,
  SPEAK_DAILY_LIMIT,
  emptySpeakQuota,
  type SpeakQuota,
} from "./limits";
import { parseMicLocale, type MicLocale } from "./speech";

/** Per-tab hint mirror. The API session cookie is the credit backstop. */
export const ASK_SESSION_STORAGE_KEY = "aegisflow.askOps.session.v1";
/** Shared across tabs for the UTC day. */
export const SPEAK_DAY_STORAGE_KEY = "aegisflow.askOps.speak.v1";
/** Mic ES|EN choice. Missing or unknown values stay on Spanish. */
export const MIC_LOCALE_STORAGE_KEY = "aegisflow.askOps.micLocale.v1";

export type AskStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function browserSession(): AskStore | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function browserLocal(): AskStore | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function clampStoredCount(raw: string | null, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), max);
}

export function loadAskCount(store?: AskStore | null): number {
  const s = store === undefined ? browserSession() : store;
  if (!s) return 0;
  try {
    return clampStoredCount(s.getItem(ASK_SESSION_STORAGE_KEY), ASK_SESSION_LIMIT);
  } catch {
    return 0;
  }
}

export function saveAskCount(count: number, store?: AskStore | null): void {
  const s = store === undefined ? browserSession() : store;
  if (!s) return;
  try {
    s.setItem(
      ASK_SESSION_STORAGE_KEY,
      String(clampStoredCount(String(count), ASK_SESSION_LIMIT)),
    );
  } catch {
    // Ops stays usable if storage is blocked.
  }
}

export function loadSpeakQuota(day: string, store?: AskStore | null): SpeakQuota {
  const s = store === undefined ? browserLocal() : store;
  if (!s) return emptySpeakQuota(day);
  try {
    const raw = s.getItem(SPEAK_DAY_STORAGE_KEY);
    if (!raw) return emptySpeakQuota(day);
    const parsed = JSON.parse(raw) as Partial<SpeakQuota>;
    if (parsed.day !== day) return emptySpeakQuota(day);
    return {
      day,
      speaks: clampStoredCount(String(parsed.speaks ?? 0), SPEAK_DAILY_LIMIT),
      chars: clampStoredCount(String(parsed.chars ?? 0), SPEAK_DAILY_CHAR_LIMIT),
    };
  } catch {
    return emptySpeakQuota(day);
  }
}

export function loadMicLocale(store?: AskStore | null): MicLocale {
  const s = store === undefined ? browserLocal() : store;
  if (!s) return parseMicLocale(null);
  try {
    return parseMicLocale(s.getItem(MIC_LOCALE_STORAGE_KEY));
  } catch {
    return parseMicLocale(null);
  }
}

export function saveMicLocale(locale: MicLocale, store?: AskStore | null): void {
  const s = store === undefined ? browserLocal() : store;
  if (!s) return;
  try {
    s.setItem(MIC_LOCALE_STORAGE_KEY, locale === "en" ? "en" : "es");
  } catch {
    // Typing still works if storage is blocked. Next visit defaults to ES.
  }
}

export function saveSpeakQuota(quota: SpeakQuota, store?: AskStore | null): void {
  const s = store === undefined ? browserLocal() : store;
  if (!s) return;
  try {
    const safe: SpeakQuota = {
      day: quota.day,
      speaks: clampStoredCount(String(quota.speaks), SPEAK_DAILY_LIMIT),
      chars: clampStoredCount(String(quota.chars), SPEAK_DAILY_CHAR_LIMIT),
    };
    s.setItem(SPEAK_DAY_STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // ignore
  }
}
