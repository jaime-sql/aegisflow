import { getOpsSession } from "@/lib/auth/session";
import { handleBriefAloud } from "@/lib/tts/brief";

export const dynamic = "force-dynamic";

/**
 * ElevenLabs Brief aloud (Manager + Viewer listen-only play/stop).
 * Returns audio/mpeg on success, JSON `{ sim: true }` on missing key / failure.
 * Never throws to the Ops shell.
 */
async function handle(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const session = await getOpsSession(url.searchParams.get("role") ?? undefined);
    return await handleBriefAloud({
      session,
      eventId: url.searchParams.get("eventId"),
      regionId: url.searchParams.get("region"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "brief-aloud failed";
    console.warn("[brief-aloud] route", message);
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

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
