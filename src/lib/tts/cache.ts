/**
 * Last Brief aloud clip per incident eventId.
 *
 * Reuses the WIND_CACHE KV binding with prefix `tts:` so we do not mint a
 * second namespace (expire-first ElevenLabs credits). Local / tests use
 * the in-process map from `memoryTtsKv()`.
 */

export const TTS_CACHE_KEY_PREFIX = "tts:";
export const TTS_CACHE_VERSION = 1 as const;
/** 7 days — last clip per eventId; miss only when summary/voice changes. */
export const TTS_CACHE_TTL_SEC = 7 * 24 * 60 * 60;

/** Premade Rachel (`21m00Tcm4TlvDq8ikWAM`) — documented default; Jaime did not pick a voice. Override with ELEVENLABS_VOICE_ID. */
export const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
/** Flash is the cheap/fast model for a 15–30s radio clip. */
export const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_flash_v2_5";

export type TtsKv = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
};

export type TtsCacheEntry = {
  v: typeof TTS_CACHE_VERSION;
  eventId: string;
  textHash: string;
  voiceId: string;
  modelId: string;
  contentType: "audio/mpeg";
  audioB64: string;
  createdAt: string;
  /** Decoded on read; never serialized. */
  audio: Uint8Array;
};

type TtsCacheWire = Omit<TtsCacheEntry, "audio">;

export function ttsCacheKey(eventId: string): string {
  return `${TTS_CACHE_KEY_PREFIX}${eventId}`;
}

export function memoryTtsKv(seed?: Record<string, string>): TtsKv {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    async get(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.byteLength === 0) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export function serializeTtsCacheEntry(
  entry: Omit<TtsCacheEntry, "audio">,
): string {
  const wire: TtsCacheWire = {
    v: TTS_CACHE_VERSION,
    eventId: entry.eventId,
    textHash: entry.textHash,
    voiceId: entry.voiceId,
    modelId: entry.modelId,
    contentType: "audio/mpeg",
    audioB64: entry.audioB64,
    createdAt: entry.createdAt,
  };
  return JSON.stringify(wire);
}

export function parseTtsCacheEntry(raw: string | null): TtsCacheEntry | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;
  if (rec.v !== TTS_CACHE_VERSION) return null;
  if (typeof rec.eventId !== "string" || !rec.eventId.startsWith("evt_")) {
    return null;
  }
  if (typeof rec.textHash !== "string" || !rec.textHash) return null;
  if (typeof rec.voiceId !== "string" || !rec.voiceId) return null;
  if (typeof rec.modelId !== "string" || !rec.modelId) return null;
  if (rec.contentType !== "audio/mpeg") return null;
  if (typeof rec.audioB64 !== "string" || !rec.audioB64) return null;
  if (typeof rec.createdAt !== "string") return null;
  const audio = b64ToBytes(rec.audioB64);
  if (!audio) return null;
  return {
    v: TTS_CACHE_VERSION,
    eventId: rec.eventId,
    textHash: rec.textHash,
    voiceId: rec.voiceId,
    modelId: rec.modelId,
    contentType: "audio/mpeg",
    audioB64: rec.audioB64,
    createdAt: rec.createdAt,
    audio,
  };
}

export async function readTtsCache(
  kv: TtsKv,
  eventId: string,
): Promise<TtsCacheEntry | null> {
  try {
    return parseTtsCacheEntry(await kv.get(ttsCacheKey(eventId)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "kv get failed";
    console.warn("[brief-aloud] cache read", eventId, message);
    return null;
  }
}

export async function writeTtsCache(
  kv: TtsKv,
  entry: Omit<TtsCacheEntry, "audio">,
): Promise<void> {
  try {
    await kv.put(ttsCacheKey(entry.eventId), serializeTtsCacheEntry(entry), {
      expirationTtl: TTS_CACHE_TTL_SEC,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "kv put failed";
    console.warn("[brief-aloud] cache write", entry.eventId, message);
  }
}
