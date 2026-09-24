/**
 * Ask Ops quotas. Enforced in the browser and again on the API (session cookie
 * for asks, day cookie for Speak) so a cleared sessionStorage cannot keep
 * calling OpenAI / ElevenLabs.
 *
 * Asks: 10 per browser session.
 * Speak: 20 clips per browser per UTC day, or 15_000 characters, whichever
 * comes first.
 */

export const ASK_SESSION_LIMIT = 10;
export const SPEAK_DAILY_LIMIT = 20;
export const SPEAK_DAILY_CHAR_LIMIT = 15_000;
/** One Speak clip. Daily char cap still applies. */
export const SPEAK_UTTERANCE_MAX = 800;

export const ASK_COUNT_COOKIE = "aegisflow_ask_n";
export const SPEAK_QUOTA_COOKIE = "aegisflow_speak_day";

export const ASK_LIMIT_HINT = "Session limit — 10 asks.";
export const SPEAK_LIMIT_HINT = "Daily Speak limit · ~20";

export type SpeakQuota = {
  day: string;
  speaks: number;
  chars: number;
};

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function clampInt(value: unknown, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), max);
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return null;
}

export function readAskCount(cookieHeader: string | null | undefined): number {
  return clampInt(readCookie(cookieHeader, ASK_COUNT_COOKIE), ASK_SESSION_LIMIT);
}

export function canConsumeAsk(count: number): boolean {
  return count < ASK_SESSION_LIMIT;
}

export function askCountCookie(count: number): string {
  const next = clampInt(count, ASK_SESSION_LIMIT);
  return `${ASK_COUNT_COOKIE}=${next}; Path=/; SameSite=Lax`;
}

export function emptySpeakQuota(day: string): SpeakQuota {
  return { day, speaks: 0, chars: 0 };
}

export function readSpeakQuota(cookieHeader: string | null | undefined, day: string): SpeakQuota {
  const raw = readCookie(cookieHeader, SPEAK_QUOTA_COOKIE);
  if (!raw) return emptySpeakQuota(day);
  const [storedDay, speaks, chars] = raw.split(".");
  if (storedDay !== day) return emptySpeakQuota(day);
  return {
    day,
    speaks: clampInt(speaks, SPEAK_DAILY_LIMIT),
    chars: clampInt(chars, SPEAK_DAILY_CHAR_LIMIT),
  };
}

export function speakQuotaCookie(quota: SpeakQuota): string {
  const speaks = clampInt(quota.speaks, SPEAK_DAILY_LIMIT);
  const chars = clampInt(quota.chars, SPEAK_DAILY_CHAR_LIMIT);
  return `${SPEAK_QUOTA_COOKIE}=${quota.day}.${speaks}.${chars}; Path=/; SameSite=Lax; Max-Age=172800`;
}

/** True when another clip of `chars` would pass both the count and char caps. */
export function canConsumeSpeak(quota: SpeakQuota, chars: number, day: string): boolean {
  if (chars <= 0) return false;
  const current = quota.day === day ? quota : emptySpeakQuota(day);
  if (current.speaks >= SPEAK_DAILY_LIMIT) return false;
  if (current.chars >= SPEAK_DAILY_CHAR_LIMIT) return false;
  if (current.chars + chars > SPEAK_DAILY_CHAR_LIMIT) return false;
  return true;
}

export function consumeSpeak(quota: SpeakQuota, chars: number, day: string): SpeakQuota {
  const current = quota.day === day ? quota : emptySpeakQuota(day);
  return {
    day,
    speaks: current.speaks + 1,
    chars: current.chars + chars,
  };
}

/** Button gate: already at either cap (does not look ahead at the next clip). */
export function speakUiCapped(quota: SpeakQuota, day: string): boolean {
  const current = quota.day === day ? quota : emptySpeakQuota(day);
  return current.speaks >= SPEAK_DAILY_LIMIT || current.chars >= SPEAK_DAILY_CHAR_LIMIT;
}

export function clipSpeakText(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= SPEAK_UTTERANCE_MAX) return cleaned;
  const sliced = cleaned.slice(0, SPEAK_UTTERANCE_MAX).replace(/\s+\S*$/, "").trim();
  return sliced || cleaned.slice(0, SPEAK_UTTERANCE_MAX).trim();
}

/** Stricter of the two quotas (cookie vs localStorage) for the same day. */
export function stricterSpeakQuota(a: SpeakQuota, b: SpeakQuota, day: string): SpeakQuota {
  const left = a.day === day ? a : emptySpeakQuota(day);
  const right = b.day === day ? b : emptySpeakQuota(day);
  return {
    day,
    speaks: Math.max(left.speaks, right.speaks),
    chars: Math.max(left.chars, right.chars),
  };
}
