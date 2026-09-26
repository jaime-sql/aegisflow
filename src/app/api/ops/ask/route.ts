import { getOpsSession } from "@/lib/auth/session";
import { handleAsk } from "@/lib/ask/answer";

export const dynamic = "force-dynamic";

/**
 * Ask Ops (Manager + Viewer). OpenAI gpt-4o-mini, DeepSeek deepseek-chat,
 * or static FAQ. Never throws into the Ops shell.
 */
async function handle(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const session = await getOpsSession(url.searchParams.get("role") ?? undefined);
    let body: {
      question?: unknown;
      regionId?: unknown;
      agents?: unknown;
      brief?: unknown;
    } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
    return await handleAsk({
      session,
      question: body.question,
      regionId: body.regionId,
      agents: body.agents,
      brief: body.brief,
      cookie: request.headers.get("cookie"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ask failed";
    console.warn("[ask-ops] route", message);
    return Response.json(
      {
        ok: false,
        sim: true,
        limited: false,
        source: "faq",
        model: null,
        answer: "Ask Ops is unavailable. The map and rail are unchanged.",
        reason: "handler",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  return handle(request);
}
