import { canAskOps, type OpsRole } from "@/lib/auth/roles";
import { resolveOpsRegion } from "@/lib/regions";
import { buildAskBrief, formatAskBrief, type AskGrounding } from "./brief";
import { answerFaq, classifyAskQuestion, isHowtoQuestion } from "./faq";
import { presentAskAnswer } from "./present";
import { clampQuestion } from "./help";
import {
  ASK_LIMIT_HINT,
  askCountCookie,
  canConsumeAsk,
  readAskCount,
} from "./limits";
import { buildAskMessages, completeAskText, type AskSource } from "./models";

export type AskResponseBody = {
  ok: boolean;
  sim: boolean;
  limited: boolean;
  source: AskSource;
  model: string | null;
  answer: string;
  hint?: string;
  reason?: "bad_request" | "handler";
};

export type AskDeps = {
  session: { role: OpsRole };
  question?: unknown;
  regionId?: unknown;
  agents?: unknown;
  /** Live FIRMS / Wind / Predicted honesty from the Ops client. */
  brief?: unknown;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  cookie?: string | null;
};

function jsonResponse(body: AskResponseBody, setCookies: string[] = []): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

/**
 * Ask Ops for Manager and Viewer.
 * OpenAI gpt-4o-mini, then DeepSeek deepseek-chat, else static FAQ.
 * Never throws. 10 asks per browser session (cookie).
 */
export async function handleAsk(deps: AskDeps): Promise<Response> {
  try {
    if (!canAskOps(deps.session.role)) {
      return jsonResponse({
        ok: false,
        sim: true,
        limited: false,
        source: "faq",
        model: null,
        answer: "",
        reason: "handler",
      });
    }

    const question = clampQuestion(deps.question);
    const region = resolveOpsRegion(typeof deps.regionId === "string" ? deps.regionId : null);
    if (!question) {
      return jsonResponse({
        ok: false,
        sim: true,
        limited: false,
        source: "faq",
        model: null,
        answer: "Ask about this incident or how to use Ops.",
        reason: "bad_request",
      });
    }

    const count = readAskCount(deps.cookie);
    if (!canConsumeAsk(count)) {
      return jsonResponse({
        ok: false,
        sim: true,
        limited: true,
        source: "faq",
        model: null,
        answer: "",
        hint: ASK_LIMIT_HINT,
      });
    }

    const env = deps.env ?? process.env;
    const grounding: AskGrounding = { agents: deps.agents, facts: deps.brief };
    const regionFacts = {
      executiveSummary: region.executiveSummary,
      label: region.label,
      incidentName: region.incidentName,
    };
    const topic = classifyAskQuestion(question);
    // Situation and how-it-works answers come from the brief, not a free-form model reply.
    if (topic === "situation" || (topic === "help" && isHowtoQuestion(question))) {
      return jsonResponse(
        {
          ok: true,
          sim: true,
          limited: false,
          source: "faq",
          model: null,
          answer: answerFaq(question, regionFacts, grounding),
        },
        [askCountCookie(count + 1)],
      );
    }

    const messages = buildAskMessages({
      question,
      regionLabel: region.label,
      incidentName: region.incidentName,
      executiveSummary: region.executiveSummary,
      agents: deps.agents,
      brief: formatAskBrief(buildAskBrief({ region, grounding })),
    });
    const completion = await completeAskText(messages, env, deps.fetch ?? fetch);
    const answer = completion.text
      ? presentAskAnswer(question, completion.text, regionFacts, grounding)
      : answerFaq(question, regionFacts, grounding);
    const sim = completion.source === "faq" || !completion.text;

    return jsonResponse(
      {
        ok: true,
        sim,
        limited: false,
        source: sim ? "faq" : completion.source,
        model: sim ? null : completion.model,
        answer,
      },
      [askCountCookie(count + 1)],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "handler failed";
    console.warn("[ask-ops] handler", message);
    return jsonResponse({
      ok: false,
      sim: true,
      limited: false,
      source: "faq",
      model: null,
      answer: "Ask Ops is unavailable. The map and rail are unchanged.",
      reason: "handler",
    });
  }
}
