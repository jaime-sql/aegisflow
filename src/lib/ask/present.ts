import type { OpsRegion } from "@/lib/regions";
import { isEnglishRefuseWall, isGreetingBlock, REFUSE_EN, REFUSE_ES } from "./copy";
import { answerFaq, classifyAskQuestion } from "./faq";
import { askReplyLanguage, textLooksSpanish } from "./language";

function replyLanguageOk(question: string, text: string): boolean {
  const wantSpanish = askReplyLanguage(question) === "es";
  const gotSpanish = textLooksSpanish(text);
  return wantSpanish ? gotSpanish : !gotSpanish;
}

/**
 * Keep a live model answer when it already follows the copy rules.
 * Replace the long English refusal wall, a greeting block, or the wrong language.
 */
export function presentAskAnswer(
  question: string,
  text: string,
  region: Pick<OpsRegion, "executiveSummary" | "label">,
): string {
  const topic = classifyAskQuestion(question);
  const lang = askReplyLanguage(question);
  if (isEnglishRefuseWall(text)) {
    if (topic === "scope") return lang === "es" ? REFUSE_ES : REFUSE_EN;
    return answerFaq(question, region);
  }
  if (topic === "greeting" && isGreetingBlock(text)) return answerFaq(question, region);
  if (!replyLanguageOk(question, text)) return answerFaq(question, region);
  return text;
}
