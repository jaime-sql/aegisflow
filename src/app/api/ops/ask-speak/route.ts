import { handleAskSpeak } from "@/lib/ask/speak";
import { getOpsSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Speak the latest Ask reply (ElevenLabs TTS, same key/voice as Brief aloud).
 * Audio on success. JSON `{ sim: true }` when muted, capped, or failed.
 */
async function handle(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const session = await getOpsSession(url.searchParams.get("role") ?? undefined);
    let text: unknown = "";
    try {
      const body = (await request.json()) as { text?: unknown };
      text = body.text;
    } catch {
      text = "";
    }
    return await handleAskSpeak({
      session,
      text,
      cookie: request.headers.get("cookie"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ask-speak failed";
    console.warn("[ask-speak] route", message);
    return Response.json(
      { ok: false, sim: true, reason: "handler" },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-AegisFlow-Tts": "sim",
        },
      },
    );
  }
}

export async function POST(request: Request) {
  return handle(request);
}
