import { createHash } from "node:crypto";
import { canSpeakBrief, type OpsRole } from "@/lib/auth/roles";
import { resolveOpsRegion } from "@/lib/regions";
import {
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_VOICE_ID,
  TTS_CACHE_VERSION,
  memoryTtsKv,
  readTtsCache,
  writeTtsCache,
  type TtsKv,
} from "./cache";

export {
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_VOICE_ID,
  TTS_CACHE_KEY_PREFIX,
  TTS_CACHE_TTL_SEC,
  TTS_CACHE_VERSION,
  memoryTtsKv,
  parseTtsCacheEntry,
  ttsCacheKey,
} from "./cache";
export type { TtsCacheEntry, TtsKv } from "./cache";

/** ~15–30s radio clip at ~150 wpm. */
export const BRIEF_MAX_WORDS = 70;
export const BRIEF_MAX_CHARS = 420;
export const ELEVENLABS_TIMEOUT_MS = 15_000;
export const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

const processMemoryKv = memoryTtsKv();

export type BriefSimReason =
  | "missing_key"
  | "upstream"
  | "bad_request"
  | "handler";

export type BriefAloudEnv = Record<string, string | undefined>;

export type BriefAloudDeps = {
  session: { role: OpsRole };
  eventId?: string | null;
  regionId?: string | null;
  env?: BriefAloudEnv;
  fetch?: typeof fetch;
  kv?: TtsKv | null;
};

export function isElevenLabsConfigured(
  env: BriefAloudEnv = process.env,
): boolean {
  return Boolean(env.ELEVENLABS_API_KEY?.trim());
}

export function resolveElevenLabsVoiceId(
  env: BriefAloudEnv = process.env,
): string {
  const raw = env.ELEVENLABS_VOICE_ID?.trim();
  return raw || DEFAULT_ELEVENLABS_VOICE_ID;
}

export function resolveElevenLabsModelId(
  env: BriefAloudEnv = process.env,
): string {
  const raw = env.ELEVENLABS_MODEL_ID?.trim();
  return raw || DEFAULT_ELEVENLABS_MODEL_ID;
}

export function briefTextHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/**
 * Short radio-style clip from the exec summary. Not a podcast.
 * Prefix/suffix stay in the 15–30s spoken window.
 */
export function buildRadioBrief(summary: string): string {
  const cleaned = summary.replace(/\s+/g, " ").trim();
  const prefix = "AegisFlow brief. ";
  const suffix = " Out.";
  const budget = Math.max(24, BRIEF_MAX_CHARS - prefix.length - suffix.length);
  let body = cleaned;
  const words = body.split(" ").filter(Boolean);
  if (words.length > BRIEF_MAX_WORDS) {
    body = words.slice(0, BRIEF_MAX_WORDS).join(" ");
  }
  if (body.length > budget) {
    body = body.slice(0, budget).replace(/\s+\S*$/, "").trim();
  }
  if (!body) body = "No executive summary.";
  if (!/[.!?]$/.test(body)) body += ".";
  return `${prefix}${body}${suffix}`;
}

export function simJson(reason: BriefSimReason, status = 200): Response {
  return Response.json(
    { ok: false, sim: true, reason },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-AegisFlow-Tts": "sim",
      },
    },
  );
}

function audioResponse(bytes: Uint8Array, fromCache: boolean): Response {
  const copy = bytes.byteLength
    ? bytes.slice()
    : new Uint8Array();
  return new Response(copy, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
      "X-AegisFlow-Tts": fromCache ? "cache" : "live",
    },
  });
}

export async function resolveTtsKv(
  deps: Pick<BriefAloudDeps, "kv">,
  env: BriefAloudEnv = process.env,
): Promise<TtsKv | null> {
  if (deps.kv !== undefined) return deps.kv;
  if (env.CLOUDFLARE_PROD === "true") {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const ctx = await getCloudflareContext({ async: true });
      const kv = (ctx as { env?: { WIND_CACHE?: TtsKv } }).env?.WIND_CACHE;
      if (kv && typeof kv.get === "function") return kv;
    } catch (err) {
      const message = err instanceof Error ? err.message : "kv unavailable";
      console.warn("[brief-aloud] WIND_CACHE unbound", message);
    }
  }
  return processMemoryKv;
}

async function synthesizeElevenLabs(args: {
  text: string;
  voiceId: string;
  modelId: string;
  apiKey: string;
  fetchFn: typeof fetch;
}): Promise<Uint8Array | null> {
  const url = `${ELEVENLABS_TTS_URL}/${encodeURIComponent(args.voiceId)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ELEVENLABS_TIMEOUT_MS);
  try {
    const res = await args.fetchFn(url, {
      method: "POST",
      headers: {
        "xi-api-key": args.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: args.text,
        model_id: args.modelId,
      }),
      signal: ac.signal,
    });
    if (!res.ok) {
      console.warn("[brief-aloud] elevenlabs HTTP", res.status);
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0) return null;
    return buf;
  } catch (err) {
    const message = err instanceof Error ? err.message : "elevenlabs failed";
    console.warn("[brief-aloud] elevenlabs", message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Manager-only Brief aloud. Missing key / upstream failure → SIM JSON.
 * Never throws to the Ops map/rail.
 */
export async function handleBriefAloud(
  deps: BriefAloudDeps,
): Promise<Response> {
  try {
    if (!canSpeakBrief(deps.session.role)) {
      return Response.json(
        { error: "manager_only" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const env = deps.env ?? process.env;
    const region = resolveOpsRegion(deps.regionId);
    const eventId = deps.eventId?.trim() || region.incidentEventId;
    if (eventId !== region.incidentEventId) {
      return simJson("bad_request");
    }

    const text = buildRadioBrief(region.executiveSummary);
    const voiceId = resolveElevenLabsVoiceId(env);
    const modelId = resolveElevenLabsModelId(env);
    const textHash = briefTextHash(`${voiceId}:${modelId}:${text}`);

    const kv = await resolveTtsKv(deps, env);
    if (kv) {
      const cached = await readTtsCache(kv, eventId);
      if (
        cached &&
        cached.textHash === textHash &&
        cached.voiceId === voiceId &&
        cached.modelId === modelId
      ) {
        return audioResponse(cached.audio, true);
      }
    }

    if (!isElevenLabsConfigured(env)) {
      return simJson("missing_key");
    }

    const fetchFn = deps.fetch ?? fetch;
    const audio = await synthesizeElevenLabs({
      text,
      voiceId,
      modelId,
      apiKey: env.ELEVENLABS_API_KEY!.trim(),
      fetchFn,
    });
    if (!audio) return simJson("upstream");

    if (kv) {
      await writeTtsCache(kv, {
        v: TTS_CACHE_VERSION,
        eventId,
        textHash,
        voiceId,
        modelId,
        contentType: "audio/mpeg",
        audioB64: Buffer.from(audio).toString("base64"),
        createdAt: new Date().toISOString(),
      });
    }

    return audioResponse(audio, false);
  } catch (err) {
    const message = err instanceof Error ? err.message : "handler failed";
    console.warn("[brief-aloud] handler", message);
    return simJson("handler");
  }
}
