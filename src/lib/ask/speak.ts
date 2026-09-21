import { canAskOps, type OpsRole } from "@/lib/auth/roles";
import {
  isElevenLabsConfigured,
  resolveElevenLabsModelId,
  resolveElevenLabsVoiceId,
  simJson,
  synthesizeElevenLabs,
} from "@/lib/tts/brief";
import {
  SPEAK_LIMIT_HINT,
  canConsumeSpeak,
  clipSpeakText,
  consumeSpeak,
  readSpeakQuota,
  speakQuotaCookie,
  utcDay,
} from "./limits";

export type AskSpeakDeps = {
  session: { role: OpsRole };
  text?: unknown;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  cookie?: string | null;
  now?: () => Date;
};

function limitedJson(): Response {
  return Response.json(
    {
      ok: false,
      sim: true,
      limited: true,
      hint: SPEAK_LIMIT_HINT,
      reason: "daily_limit",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-AegisFlow-Tts": "sim",
      },
    },
  );
}

/**
 * Speak the latest Ask reply with the same ElevenLabs key, voice, and
 * text-to-speech path as Brief aloud. Missing key / failure → SIM JSON.
 * Daily cap skips the upstream call. Not a conversational agent.
 */
export async function handleAskSpeak(deps: AskSpeakDeps): Promise<Response> {
  try {
    if (!canAskOps(deps.session.role)) {
      return simJson("handler");
    }

    const text = clipSpeakText(typeof deps.text === "string" ? deps.text : "");
    if (!text) return simJson("bad_request");

    const env = deps.env ?? process.env;
    if (!isElevenLabsConfigured(env)) {
      return simJson("missing_key");
    }

    const day = utcDay(deps.now ? deps.now() : new Date());
    const quota = readSpeakQuota(deps.cookie, day);
    if (!canConsumeSpeak(quota, text.length, day)) {
      return limitedJson();
    }

    const voiceId = resolveElevenLabsVoiceId(env);
    const modelId = resolveElevenLabsModelId(env);
    const audio = await synthesizeElevenLabs({
      text,
      voiceId,
      modelId,
      apiKey: env.ELEVENLABS_API_KEY!.trim(),
      fetchFn: deps.fetch ?? fetch,
      logTag: "ask-speak",
    });
    if (!audio) return simJson("upstream");

    const next = consumeSpeak(quota, text.length, day);
    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-AegisFlow-Tts": "live",
    });
    headers.append("Set-Cookie", speakQuotaCookie(next));
    const copy = audio.byteLength ? audio.slice() : new Uint8Array();
    return new Response(copy, { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "handler failed";
    console.warn("[ask-speak] handler", message);
    return simJson("handler");
  }
}
