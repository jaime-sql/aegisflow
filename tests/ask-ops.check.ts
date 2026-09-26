import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAskOps, canDispatch, canSpeakBrief } from "../src/lib/auth/roles";
import { opsAskSpeakUrl, opsAskUrl } from "../src/lib/base-path";
import { DEEPSEEK_MODEL, OPENAI_MODEL } from "../src/lib/agents/runtime";
import { handleAsk } from "../src/lib/ask/answer";
import { answerFaq, classifyAskQuestion } from "../src/lib/ask/faq";
import {
  ASK_BRIEF_MAX_CHARS,
  askBriefFactsFromIncident,
  formatAskBrief,
  buildAskBrief,
} from "../src/lib/ask/brief";
import { askReplyLanguage } from "../src/lib/ask/language";
import { cloneFixtureIncident } from "../src/lib/fixtures/aegisfire-01";
import {
  ASK_TOPIC_LINE,
  GREETING_EN,
  GREETING_ES,
  LANGUAGE_ES,
  REFUSE_EN,
  REFUSE_ES,
} from "../src/lib/ask/copy";
import { askReplyLanguage } from "../src/lib/ask/language";
import { presentAskAnswer } from "../src/lib/ask/present";
import { ASK_AGENT_LINE_LIMIT, OPS_ASK_HELP } from "../src/lib/ask/help";
import {
  ASK_LIMIT_HINT,
  ASK_SESSION_LIMIT,
  SPEAK_DAILY_CHAR_LIMIT,
  SPEAK_DAILY_LIMIT,
  SPEAK_LIMIT_HINT,
  canConsumeAsk,
  canConsumeSpeak,
  clipSpeakText,
  readAskCount,
  readSpeakQuota,
  utcDay,
} from "../src/lib/ask/limits";
import { ASK_DEEPSEEK_MODEL, ASK_OPENAI_MODEL, askSystemPrompt } from "../src/lib/ask/models";
import { handleAskSpeak } from "../src/lib/ask/speak";
import {
  MIC_DENIED_HINT,
  MIC_IDLE_LABEL,
  MIC_LOCALE_TITLE_EN,
  MIC_LOCALE_TITLE_ES,
  micAriaLabel,
  micLangAfterError,
  micLocaleSwitch,
  micLocaleTitle,
  micRecognitionLang,
  shouldAutoSpeak,
  speechRecognitionCtor,
  transcriptFromResults,
} from "../src/lib/ask/speech";
import {
  MIC_LOCALE_STORAGE_KEY,
  loadAskCount,
  loadMicLocale,
  saveAskCount,
  saveMicLocale,
  loadSpeakQuota,
  saveSpeakQuota,
} from "../src/lib/ask/storage";
import { OPS_REGIONS } from "../src/lib/regions";
import { REQUIRED_WORKER_SECRETS } from "../scripts/select-worker-secrets.mjs";

const manager = { role: "manager" as const };
const viewer = { role: "viewer" as const };
const sv = OPS_REGIONS["el-salvador"];
const workerOps = "https://aegisflow.jaime-8a8.workers.dev/aegisflow/ops";

assert.equal(ASK_OPENAI_MODEL, "gpt-4o-mini");
assert.equal(ASK_DEEPSEEK_MODEL, "deepseek-chat");
assert.equal(OPENAI_MODEL, "gpt-4o-mini");
assert.equal(DEEPSEEK_MODEL, "deepseek-chat");
assert.equal(ASK_SESSION_LIMIT, 10);
assert.equal(SPEAK_DAILY_LIMIT, 20);
assert.equal(SPEAK_DAILY_CHAR_LIMIT, 15_000);
assert.equal(ASK_AGENT_LINE_LIMIT, 3);
assert.equal(ASK_LIMIT_HINT, "Session limit — 10 asks.");
assert.equal(SPEAK_LIMIT_HINT, "Daily Speak limit · ~20");
assert.match(OPS_ASK_HELP, /Layers/);
assert.match(OPS_ASK_HELP, /Lineage/);
assert.match(OPS_ASK_HELP, /Manager-only/);
assert.match(OPS_ASK_HELP, /Region/);
assert.match(OPS_ASK_HELP, /Feeds/);

assert.equal(canAskOps("manager"), true);
assert.equal(canAskOps("viewer"), true);

assert.equal(
  transcriptFromResults([
    { 0: { transcript: "how do " } },
    { 0: { transcript: "layers work" } },
  ]),
  "how do layers work",
);
assert.equal(transcriptFromResults(null), "");
assert.equal(transcriptFromResults({ length: 0 }), "");

assert.equal(
  shouldAutoSpeak({
    voiceOrigin: true,
    configured: true,
    capped: false,
    answer: "Use the layer toggles.",
  }),
  true,
);
assert.equal(
  shouldAutoSpeak({
    voiceOrigin: false,
    configured: true,
    capped: false,
    answer: "Use the layer toggles.",
  }),
  false,
  "typed asks must not auto-speak",
);
assert.equal(
  shouldAutoSpeak({
    voiceOrigin: true,
    configured: true,
    capped: true,
    answer: "Use the layer toggles.",
  }),
  false,
);
assert.equal(
  shouldAutoSpeak({
    voiceOrigin: true,
    configured: false,
    capped: false,
    answer: "Use the layer toggles.",
  }),
  false,
);
assert.equal(
  shouldAutoSpeak({
    voiceOrigin: true,
    configured: true,
    capped: false,
    answer: "   ",
  }),
  false,
);
assert.equal(
  shouldAutoSpeak({
    voiceOrigin: true,
    configured: true,
    capped: false,
    answer: LANGUAGE_ES,
  }),
  true,
  "a Spanish reply still auto-speaks after a voice ask",
);
assert.equal(
  shouldAutoSpeak({
    voiceOrigin: false,
    configured: true,
    capped: false,
    answer: LANGUAGE_ES,
  }),
  false,
  "a typed Spanish ask must not auto-speak",
);
assert.equal(MIC_IDLE_LABEL, "Ask with voice");
assert.equal(MIC_DENIED_HINT, "Mic unavailable · type instead");
assert.equal(micAriaLabel("idle", true), "Ask with voice");
assert.equal(micAriaLabel("listening", true), "Stop listening");
assert.equal(micAriaLabel("error", true), MIC_DENIED_HINT);
assert.equal(micAriaLabel("listening", false), MIC_DENIED_HINT);
assert.equal(micAriaLabel("idle", false), MIC_DENIED_HINT);

class FakeRecognition {}
assert.equal(
  speechRecognitionCtor({ SpeechRecognition: FakeRecognition, webkitSpeechRecognition: class {} }),
  FakeRecognition,
);
assert.equal(speechRecognitionCtor({ webkitSpeechRecognition: FakeRecognition }), FakeRecognition);
assert.equal(speechRecognitionCtor({}), null);
assert.equal(speechRecognitionCtor(null), null);
assert.equal(canSpeakBrief("viewer"), true);
assert.equal(canDispatch("viewer"), false);
assert.equal(canDispatch("manager"), true);
assert.ok(!REQUIRED_WORKER_SECRETS.includes("OPENAI_API_KEY"));
assert.ok(!REQUIRED_WORKER_SECRETS.includes("DEEPSEEK_API_KEY"));
assert.ok(!REQUIRED_WORKER_SECRETS.includes("ELEVENLABS_API_KEY"));

assert.equal(
  opsAskUrl(workerOps),
  "https://aegisflow.jaime-8a8.workers.dev/aegisflow/api/ops/ask",
);
assert.equal(opsAskUrl("http://localhost:3000/ops"), "http://localhost:3000/api/ops/ask");
assert.equal(
  opsAskSpeakUrl(workerOps),
  "https://aegisflow.jaime-8a8.workers.dev/aegisflow/api/ops/ask-speak",
);
assert.doesNotMatch(opsAskUrl(workerOps), /^https?:\/\/[^/]+\/api\//);

assert.equal(ASK_TOPIC_LINE, "layers / lineage / roles / region·feeds");
assert.equal(classifyAskQuestion("What is the capital of France?"), "scope");
const scope = answerFaq("What is the capital of France?", sv);
assert.equal(scope, REFUSE_EN);
assert.equal(scope.endsWith(ASK_TOPIC_LINE), true);
assert.doesNotMatch(scope, /Paris|region picker|I can only assist|Please ask about/);
assert.match(answerFaq("How do I toggle layers?", sv), /Hotspots/);
assert.match(answerFaq("How do I toggle layers?", sv), /Map layers are Hotspots/);
assert.match(answerFaq("Who can ack dispatch?", sv), /Manager-only/);
assert.match(answerFaq("What's the situation?", sv), /El Salvador WUI watch/);
assert.doesNotMatch(answerFaq("What's the situation?", sv), /Resumen del incidente/);

assert.equal(classifyAskQuestion("hey"), "greeting");
assert.equal(classifyAskQuestion("hola"), "greeting");
assert.equal(classifyAskQuestion("can you speak Spanish?"), "greeting");
assert.equal(classifyAskQuestion("¿hablas español?"), "greeting");
assert.equal(classifyAskQuestion("¿Cuál es la capital de Francia?"), "scope");
assert.equal(classifyAskQuestion("¿Cómo funcionan las capas?"), "layers");
assert.equal(classifyAskQuestion("I need a house"), "scope");

assert.equal(answerFaq("hey", sv), GREETING_EN);
assert.equal(answerFaq("hola", sv), GREETING_ES);
assert.equal(askReplyLanguage("hey"), "en");
assert.equal(askReplyLanguage("How do layers work?"), "en");
assert.equal(askReplyLanguage("tell me how layers work"), "en");
assert.equal(askReplyLanguage("What is the capital of France?"), "en");
assert.equal(askReplyLanguage("hey necesito que me expliques como funciona"), "es");
assert.equal(askReplyLanguage("hey funciona"), "es");
assert.equal(askReplyLanguage("hey explícame cómo funciona"), "es");
assert.equal(classifyAskQuestion("hey"), "greeting");
assert.equal(classifyAskQuestion("hey necesito que me expliques como funciona"), "help");
assert.equal(classifyAskQuestion("hey funciona"), "help");
const mixedEs = answerFaq("hey necesito que me expliques como funciona", sv);
assert.match(mixedEs, /leyenda/);
assert.match(mixedEs, /capas/);
assert.doesNotMatch(mixedEs, /Map layers are Hotspots|I can help with this incident/);
assert.match(answerFaq("tell me how layers work", sv), /Map layers are Hotspots/);
assert.doesNotMatch(answerFaq("tell me how layers work", sv), /leyenda/);
const mixedPrompt = askSystemPrompt("hey necesito que me expliques como funciona");
assert.match(mixedPrompt, /Language lock: write the entire answer in Spanish/);
assert.match(mixedPrompt, /leading hey/);
assert.doesNotMatch(mixedPrompt, /Language lock: write the entire answer in English/);
assert.equal(
  presentAskAnswer(
    "hey necesito que me expliques como funciona",
    "Here is how it works in English.",
    sv,
  ),
  mixedEs,
);
assert.equal(micLocaleTitle("es"), MIC_LOCALE_TITLE_ES);
assert.equal(micLocaleTitle("en"), MIC_LOCALE_TITLE_EN);
assert.equal(MIC_LOCALE_TITLE_ES, "Idioma del micrófono");
assert.equal(MIC_LOCALE_TITLE_EN, "Mic language");
assert.equal(micLocaleSwitch("es", "es", true), "noop");
assert.equal(micLocaleSwitch("es", "en", false), "set");
assert.equal(micLocaleSwitch("es", "en", true), "restart");
assert.equal(micLocaleSwitch("en", "es", true), "restart");
assert.equal(micRecognitionLang("es"), "es-SV");
assert.equal(micRecognitionLang("es", true), "es-ES");
assert.equal(micRecognitionLang("en"), "en-US");
assert.deepEqual(micLangAfterError("es", false, "language-not-supported"), {
  esFallback: true,
  retry: true,
});
assert.deepEqual(micLangAfterError("es", true, "language-not-supported"), {
  esFallback: true,
  retry: false,
});
assert.deepEqual(micLangAfterError("en", false, "language-not-supported"), {
  esFallback: false,
  retry: false,
});
assert.deepEqual(micLangAfterError("es", false, "not-allowed"), {
  esFallback: false,
  retry: false,
});
assert.equal(answerFaq("can you speak Spanish?", sv), LANGUAGE_ES);
assert.equal(answerFaq("¿hablas español?", sv), LANGUAGE_ES);
assert.doesNotMatch(GREETING_EN, /layers \/ lineage/);
assert.doesNotMatch(GREETING_ES, /layers \/ lineage/);
assert.doesNotMatch(LANGUAGE_ES, /layers \/ lineage/);

const esScope = answerFaq("¿Cuál es la capital de Francia?", sv);
assert.equal(esScope, REFUSE_ES);
assert.equal(esScope.endsWith(ASK_TOPIC_LINE), true);
assert.doesNotMatch(esScope, /Par[ií]s|I can only assist|Please ask about|region picker/);

const capas = answerFaq("¿Cómo funcionan las capas?", sv);
assert.match(capas, /leyenda/);
assert.match(capas, /Hotspots/);
assert.doesNotMatch(capas, /Map layers are Hotspots/);

assert.match(answerFaq("¿cuál es la situación?", sv), /Resumen del incidente/);
assert.match(answerFaq("¿cuál es la situación?", sv), /El Salvador WUI watch/);
assert.equal(classifyAskQuestion("How do layers work in Spanish?"), "layers");
assert.match(answerFaq("How do layers work in Spanish?", sv), /leyenda/);
assert.doesNotMatch(answerFaq("How do layers work in Spanish?", sv), /Map layers are Hotspots/);

const mixed =
  "okay I need a house about those topics but I don't know sure you speak Spanish";
assert.equal(classifyAskQuestion(mixed), "greeting");
assert.match(answerFaq(mixed, sv), /hablo español/);
assert.doesNotMatch(answerFaq("I need a house", sv), /bedroom|real estate|español/i);

const briefAgents = [
  { title: "ALPHA", summary: "alpha line" },
  { title: "BETA", summary: "beta line" },
  { title: "GAMMA", summary: "gamma line" },
  { title: "DELTA", summary: "delta line should drop" },
];
const liveFacts = {
  firmsHonesty: "DEMO FIXTURE" as const,
  firmsAge: "4m ago",
  windHonesty: "fallback" as const,
  predicted: "present" as const,
  predictedSim: true,
};
const grounding = { agents: briefAgents, facts: liveFacts };

assert.equal(askReplyLanguage("hey necesito que me expliques"), "es");
assert.equal(askReplyLanguage("hey"), "en");
assert.equal(classifyAskQuestion("hey necesito que me expliques"), "help");
assert.equal(classifyAskQuestion("explicame que esta pasando"), "situation");
assert.equal(classifyAskQuestion("explicame que esta pasando?"), "situation");
assert.equal(classifyAskQuestion("qué está pasando"), "situation");
assert.equal(classifyAskQuestion("que esta pasando"), "situation");
assert.equal(classifyAskQuestion("what's going on"), "situation");
assert.equal(classifyAskQuestion("what is happening"), "situation");
assert.equal(classifyAskQuestion("como funciona esto"), "help");
assert.equal(classifyAskQuestion("cómo funciona esto"), "help");
assert.equal(classifyAskQuestion("hola necesito que me explicas como funciona esto"), "help");
assert.equal(classifyAskQuestion("necesito que me expliques"), "help");
assert.equal(classifyAskQuestion("how does this work"), "help");
assert.equal(classifyAskQuestion("explain this"), "help");
assert.equal(classifyAskQuestion("¿Cómo funcionan las capas?"), "layers");

const pasando = answerFaq("explicame que esta pasando", sv, grounding);
assert.match(pasando, /Te cuento lo que está pasando/);
assert.match(pasando, /Resumen del incidente/);
assert.match(pasando, /El Salvador WUI watch/);
assert.match(pasando, /FIRMS · 4m ago · DEMO FIXTURE/);
assert.match(pasando, /Wind · fallback/);
assert.match(pasando, /cono Predicted está en el mapa/);
assert.match(pasando, /SIM, no es satélite/);
assert.match(pasando, /Agentes: ALPHA/);
assert.match(pasando, /GAMMA/);
assert.doesNotMatch(pasando, /DELTA/);
assert.doesNotMatch(pasando, /Puedo ayudarte con este incidente|I can only assist|Please ask about|Map layers are Hotspots/);

const como = answerFaq("como funciona esto", sv, grounding);
assert.match(como, /Así funciona esto en El Salvador \/ WUI/);
assert.match(como, /leyenda/);
assert.match(como, /linaje/i);
assert.match(como, /Ack y Assign son solo para Manager/);
assert.match(como, /Región·fuentes/);
assert.match(como, /DEMO FIXTURE/);
assert.doesNotMatch(como, /Puedo ayudarte con este incidente|I can only assist|Map layers are Hotspots|Here's how this works/);

const holaComo = answerFaq("hola necesito que me explicas como funciona esto", sv, grounding);
assert.match(holaComo, /Así funciona esto/);
assert.match(holaComo, /leyenda/);
assert.doesNotMatch(holaComo, /Puedo ayudarte con este incidente|I can help with this incident/);

const heyEs = answerFaq("hey necesito que me expliques", sv);
assert.match(heyEs, /Así funciona esto/);
assert.doesNotMatch(heyEs, /I can help with this incident|Hi — I'm here/);

const goingOn = answerFaq("what's going on", sv, grounding);
assert.match(goingOn, /Here's what is happening on El Salvador \/ WUI/);
assert.match(goingOn, /El Salvador WUI watch/);
assert.match(goingOn, /DEMO FIXTURE/);
assert.match(goingOn, /Wind · fallback/);
assert.doesNotMatch(goingOn, /Resumen del incidente|Te cuento|Así funciona|Puedo ayudarte/);

const howEn = answerFaq("how does this work", sv, grounding);
assert.match(howEn, /Here's how this works on El Salvador \/ WUI/);
assert.match(howEn, /legend toggles/);
assert.match(howEn, /Region·feeds/);
assert.match(howEn, /DEMO FIXTURE/);
assert.doesNotMatch(howEn, /Así funciona|leyenda|Resumen del incidente/);

const explainEn = answerFaq("explain this", sv);
assert.match(explainEn, /Here's how this works/);
assert.match(explainEn, /Lineage/);
assert.doesNotMatch(explainEn, /Así funciona|leyenda/);

const fixtureFacts = askBriefFactsFromIncident(cloneFixtureIncident());
assert.equal(fixtureFacts.firmsHonesty, "DEMO FIXTURE");
assert.equal(fixtureFacts.windHonesty, "fallback");
assert.equal(fixtureFacts.predicted, "present");
assert.equal(fixtureFacts.predictedSim, true);
const packed = formatAskBrief(
  buildAskBrief({
    region: sv,
    grounding: { agents: briefAgents, facts: fixtureFacts },
  }),
);
assert.match(packed, /Ask brief/);
assert.match(packed, /DEMO FIXTURE/);
assert.match(packed, /Wind · fallback/);
assert.match(packed, /How-to EN/);
assert.match(packed, /How-to ES/);
assert.match(packed, /ALPHA/);
assert.doesNotMatch(packed, /DELTA/);
assert.ok(packed.length <= ASK_BRIEF_MAX_CHARS);
assert.doesNotMatch(packed, /embedding|pinecone|vector store|notion/i);

const enPrompt = askSystemPrompt("How do layers work?");
assert.match(enPrompt, /Language lock: write the entire answer in English/);
assert.match(enPrompt, /Ack and Assign/);
assert.match(enPrompt, /one warm line plus a short invite/);
assert.match(enPrompt, /can you speak Spanish/);
assert.match(enPrompt, new RegExp(ASK_TOPIC_LINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(enPrompt, /English refusal, use this shape/);
assert.match(enPrompt, /I can help with this incident — layers \/ lineage \/ roles \/ region·feeds/);
assert.doesNotMatch(enPrompt, /refuse in one sentence and name those topics/);
const esPrompt = askSystemPrompt("¿hablas español?");
assert.match(esPrompt, /Language lock: write the entire answer in Spanish/);
assert.match(esPrompt, /Never answer a Spanish question with an English refusal/);
assert.match(esPrompt, /Puedo ayudarte con este incidente — layers \/ lineage \/ roles \/ region·feeds/);
assert.doesNotMatch(esPrompt, /Language lock: write the entire answer in English/);

const WALLS = [
  "I can only assist with questions about the current incident and how to use the Ops screen, including map layers, lineage, roles, the region picker, and feeds. Please ask about those topics.",
  "I can only provide information about the current incident and how to use the Ops screen, including map layers, lineage, roles, the region picker, and feeds. Please ask about those topics.",
  "I'm unable to assist with that. Please ask about map layers, lineage, roles, the region picker, or feeds.",
];
for (const wall of WALLS) {
  assert.equal(presentAskAnswer("hey", wall, sv), GREETING_EN);
  assert.equal(presentAskAnswer("hola", wall, sv), GREETING_ES);
  assert.equal(presentAskAnswer("¿hablas español?", wall, sv), LANGUAGE_ES);
  assert.equal(presentAskAnswer("What is the capital of France?", wall, sv), REFUSE_EN);
  assert.equal(presentAskAnswer("¿Cuál es la capital de Francia?", wall, sv), REFUSE_ES);
  assert.match(presentAskAnswer("How do layers work?", wall, sv), /Map layers are Hotspots/);
  assert.doesNotMatch(presentAskAnswer("hey", wall, sv), /I can only assist|Please ask about|region picker/);
}

assert.equal(canConsumeAsk(0), true);
assert.equal(canConsumeAsk(9), true);
assert.equal(canConsumeAsk(10), false);
assert.equal(readAskCount("aegisflow_ask_n=10"), 10);
assert.equal(readSpeakQuota("aegisflow_speak_day=2020-01-01.20.15000", "2026-09-21").speaks, 0);

const day = utcDay(new Date("2026-09-21T12:00:00.000Z"));
assert.equal(day, "2026-09-21");
assert.equal(canConsumeSpeak({ day, speaks: 19, chars: 100 }, 50, day), true);
assert.equal(canConsumeSpeak({ day, speaks: 20, chars: 100 }, 50, day), false);
assert.equal(canConsumeSpeak({ day, speaks: 1, chars: 14_950 }, 100, day), false);
assert.ok(clipSpeakText("word ".repeat(400)).length <= 800);

function memoryStore() {
  const mem = new Map<string, string>();
  return {
    getItem(key: string) {
      return mem.has(key) ? mem.get(key)! : null;
    },
    setItem(key: string, value: string) {
      mem.set(key, value);
    },
  };
}

const askStore = memoryStore();
assert.equal(loadAskCount(askStore), 0);
saveAskCount(ASK_SESSION_LIMIT, askStore);
assert.equal(loadAskCount(askStore), ASK_SESSION_LIMIT);
assert.equal(canConsumeAsk(loadAskCount(askStore)), false);
const speakStore = memoryStore();
saveSpeakQuota({ day: "2026-09-21", speaks: 20, chars: 10 }, speakStore);
assert.equal(loadSpeakQuota("2026-09-21", speakStore).speaks, 20);
assert.equal(loadSpeakQuota("2026-09-22", speakStore).speaks, 0);
const localeStore = memoryStore();
assert.equal(loadMicLocale(localeStore), "es");
assert.equal(loadMicLocale(null), "es");
saveMicLocale("en", localeStore);
assert.equal(loadMicLocale(localeStore), "en");
saveMicLocale("es", localeStore);
assert.equal(loadMicLocale(localeStore), "es");
localeStore.setItem(MIC_LOCALE_STORAGE_KEY, "fr");
assert.equal(loadMicLocale(localeStore), "es");

type Captured = { url: string; body: { model?: string; messages?: Array<{ content?: string }> } };

function llmFetch(reply: (url: string) => { status: number; content?: string }) {
  let calls = 0;
  const captured: Captured[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls += 1;
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Captured["body"];
    captured.push({ url, body });
    const next = reply(url);
    if (next.status !== 200) return new Response("no", { status: next.status });
    return Response.json({ choices: [{ message: { content: next.content ?? "Legend toggles." } }] });
  };
  return {
    fetchFn,
    captured,
    get calls() {
      return calls;
    },
  };
}

function cookieJar(res: Response, prev = ""): string {
  const set =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""].filter(Boolean);
  const jar = new Map<string, string>();
  const absorb = (header: string) => {
    for (const part of header.split(";")) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const name = trimmed.slice(0, eq);
      if (!name.startsWith("aegisflow_")) continue;
      jar.set(name, trimmed.slice(eq + 1));
    }
  };
  absorb(prev);
  for (const row of set) absorb(row.split(";")[0] ?? row);
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

const agents = [
  { title: "ALPHA", summary: "alpha line" },
  { title: "BETA", summary: "beta line" },
  { title: "GAMMA", summary: "gamma line" },
  { title: "DELTA", summary: "delta line should drop" },
];

async function jsonBody(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

async function faqWhenKeysEmpty() {
  let calls = 0;
  const fetchFn: typeof fetch = async () => {
    calls += 1;
    throw new Error("network should not run");
  };
  const res = await handleAsk({
    session: viewer,
    question: "How do map layers work?",
    regionId: "el-salvador",
    agents,
    env: { OPENAI_API_KEY: "", DEEPSEEK_API_KEY: "  " },
    fetch: fetchFn,
    cookie: null,
  });
  const body = await jsonBody(res);
  assert.equal(body.ok, true);
  assert.equal(body.sim, true);
  assert.equal(body.source, "faq");
  assert.equal(body.model, null);
  assert.equal(body.limited, false);
  assert.match(String(body.answer), /Hotspots/);
  assert.equal(calls, 0);
  assert.match(cookieJar(res), /aegisflow_ask_n=1/);
}

async function modelPickAndFailover() {
  const primary = llmFetch(() => ({ status: 200, content: "Toggle Hotspots, Wind, and Agents." }));
  const ok = await handleAsk({
    session: manager,
    question: "How do layers work?",
    regionId: "el-salvador",
    agents,
    env: { OPENAI_API_KEY: "sk-test", DEEPSEEK_API_KEY: "ds-test" },
    fetch: primary.fetchFn,
  });
  const okBody = await jsonBody(ok);
  assert.equal(okBody.source, "openai");
  assert.equal(okBody.model, "gpt-4o-mini");
  assert.equal(okBody.sim, false);
  assert.equal(primary.calls, 1);
  assert.match(primary.captured[0]!.url, /api\.openai\.com\/v1\/chat\/completions/);
  assert.equal(primary.captured[0]!.body.model, "gpt-4o-mini");
  const user = primary.captured[0]!.body.messages?.[1]?.content ?? "";
  const system = primary.captured[0]!.body.messages?.[0]?.content ?? "";
  assert.match(user, /El Salvador WUI watch/);
  assert.match(user, /ALPHA/);
  assert.match(user, /GAMMA/);
  assert.doesNotMatch(user, /DELTA/);
  assert.match(system, /Ack and Assign/);
  assert.match(system, /Language lock: write the entire answer in English/);
  assert.match(system, /friendly teammate/);

  const backup = llmFetch((url) => {
    if (url.includes("openai.com")) return { status: 503 };
    return { status: 200, content: "DeepSeek fallback answer about lineage." };
  });
  const failedOver = await handleAsk({
    session: viewer,
    question: "Show lineage",
    regionId: "cascade",
    agents,
    env: {
      OPENAI_API_KEY: "sk-test",
      DEEPSEEK_API_KEY: "ds-test",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    },
    fetch: backup.fetchFn,
  });
  const backupBody = await jsonBody(failedOver);
  assert.equal(backup.calls, 2);
  assert.match(backup.captured[1]!.url, /api\.deepseek\.com\/chat\/completions/);
  assert.equal(backup.captured[1]!.body.model, "deepseek-chat");
  assert.equal(backupBody.source, "deepseek");
  assert.equal(backupBody.model, "deepseek-chat");
  assert.equal(backupBody.sim, false);

  const bothDown = llmFetch(() => ({ status: 500 }));
  const faq = await handleAsk({
    session: manager,
    question: "What is the capital of France?",
    regionId: "el-salvador",
    env: { OPENAI_API_KEY: "sk-test", DEEPSEEK_API_KEY: "ds-test" },
    fetch: bothDown.fetchFn,
  });
  const faqBody = await jsonBody(faq);
  assert.equal(bothDown.calls, 2);
  assert.equal(faqBody.sim, true);
  assert.equal(faqBody.source, "faq");
  assert.equal(String(faqBody.answer), REFUSE_EN);
  assert.doesNotMatch(String(faqBody.answer), /Paris/);

  const spanishDown = llmFetch(() => ({ status: 500 }));
  const spanishFaq = await handleAsk({
    session: viewer,
    question: "¿Cuál es la capital de Francia?",
    regionId: "el-salvador",
    env: { OPENAI_API_KEY: "sk-test", DEEPSEEK_API_KEY: "ds-test" },
    fetch: spanishDown.fetchFn,
  });
  const spanishBody = await jsonBody(spanishFaq);
  assert.equal(spanishBody.source, "faq");
  assert.equal(String(spanishBody.answer), REFUSE_ES);
  assert.doesNotMatch(String(spanishBody.answer), /Par[ií]s|I can only assist/);

  const walled = llmFetch(() => ({ status: 200, content: WALLS[0] }));
  const walledHey = await handleAsk({
    session: viewer,
    question: "hey",
    regionId: "el-salvador",
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: walled.fetchFn,
  });
  const walledHeyBody = await jsonBody(walledHey);
  assert.equal(walledHeyBody.source, "openai");
  assert.equal(walledHeyBody.answer, GREETING_EN);
  const walledEs = await handleAsk({
    session: viewer,
    question: "¿Cuál es la capital de Francia?",
    regionId: "el-salvador",
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: walled.fetchFn,
  });
  const walledEsBody = await jsonBody(walledEs);
  assert.equal(walledEsBody.answer, REFUSE_ES);
  assert.doesNotMatch(String(walledEsBody.answer), /I can only assist|region picker/);

  const spanishLive = llmFetch(() => ({
    status: 200,
    content: "Sí, hablo español. Pregúntame sobre las capas del mapa.",
  }));
  const spanishOk = await handleAsk({
    session: viewer,
    question: "¿hablas español?",
    regionId: "el-salvador",
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: spanishLive.fetchFn,
  });
  const spanishOkBody = await jsonBody(spanishOk);
  assert.equal(spanishOkBody.source, "openai");
  assert.equal(spanishLive.calls, 1);
  assert.match(String(spanishOkBody.answer), /español/);
  assert.match(
    spanishLive.captured[0]!.body.messages?.[0]?.content ?? "",
    /Language lock: write the entire answer in Spanish/,
  );
}

async function situationBriefSkipsModel() {
  let calls = 0;
  const fetchFn: typeof fetch = async () => {
    calls += 1;
    throw new Error("situation and how-to intents must not call the model");
  };
  const env = { OPENAI_API_KEY: "sk-test", DEEPSEEK_API_KEY: "ds-test" };
  const situation = await handleAsk({
    session: viewer,
    question: "explicame que esta pasando",
    regionId: "el-salvador",
    agents,
    brief: liveFacts,
    env,
    fetch: fetchFn,
  });
  const situationBody = await jsonBody(situation);
  assert.equal(calls, 0);
  assert.equal(situationBody.ok, true);
  assert.equal(situationBody.sim, true);
  assert.equal(situationBody.source, "faq");
  assert.match(String(situationBody.answer), /Te cuento lo que está pasando/);
  assert.match(String(situationBody.answer), /FIRMS · 4m ago · DEMO FIXTURE/);
  assert.match(String(situationBody.answer), /Wind · fallback/);
  assert.match(String(situationBody.answer), /ALPHA/);
  assert.match(String(situationBody.answer), /El Salvador WUI watch/);
  assert.doesNotMatch(
    String(situationBody.answer),
    /Puedo ayudarte con este incidente|I can only assist|Please ask about/,
  );
  assert.match(cookieJar(situation), /aegisflow_ask_n=1/);

  const howto = await handleAsk({
    session: manager,
    question: "como funciona esto",
    regionId: "el-salvador",
    agents,
    brief: liveFacts,
    env,
    fetch: fetchFn,
  });
  const howtoBody = await jsonBody(howto);
  assert.equal(calls, 0);
  assert.match(String(howtoBody.answer), /Así funciona esto/);
  assert.match(String(howtoBody.answer), /leyenda/);
  assert.match(String(howtoBody.answer), /DEMO FIXTURE/);
  assert.doesNotMatch(String(howtoBody.answer), /Map layers are Hotspots|I can help with this incident/);

  const english = await handleAsk({
    session: viewer,
    question: "what's going on",
    regionId: "el-salvador",
    brief: liveFacts,
    env,
    fetch: fetchFn,
  });
  const englishBody = await jsonBody(english);
  assert.match(String(englishBody.answer), /Here's what is happening/);
  assert.match(String(englishBody.answer), /DEMO FIXTURE/);
  assert.doesNotMatch(String(englishBody.answer), /Resumen del incidente|Te cuento/);

  const explain = await handleAsk({
    session: viewer,
    question: "explain this",
    regionId: "cascade",
    env,
    fetch: fetchFn,
  });
  const explainBody = await jsonBody(explain);
  assert.match(String(explainBody.answer), /Here's how this works on Cascade/);
  assert.doesNotMatch(String(explainBody.answer), /Así funciona|leyenda/);
  assert.equal(calls, 0);

  const grounded = llmFetch(() => ({ status: 200, content: "Toggle the legend." }));
  const layers = await handleAsk({
    session: viewer,
    question: "How do layers work?",
    regionId: "el-salvador",
    agents,
    brief: liveFacts,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: grounded.fetchFn,
  });
  const layersBody = await jsonBody(layers);
  assert.equal(layersBody.source, "openai");
  const user = grounded.captured[0]!.body.messages?.[1]?.content ?? "";
  assert.match(user, /Ask brief/);
  assert.match(user, /FIRMS · 4m ago · DEMO FIXTURE/);
  assert.match(user, /Wind · fallback/);
  assert.match(user, /Predicted cone: on map · SIM · not satellite/);
  assert.match(user, /How-to ES/);
  assert.match(user, /How-to EN/);
  assert.match(user, /ALPHA/);
  assert.doesNotMatch(user, /DELTA/);
  assert.ok(user.length < 8000);
}

async function askSessionCap() {
  const probe = llmFetch(() => ({ status: 200, content: "Use the region picker." }));
  let cookie = "";
  for (let i = 0; i < ASK_SESSION_LIMIT; i += 1) {
    const res = await handleAsk({
      session: viewer,
      question: `Region question ${i}`,
      regionId: "el-salvador",
      env: { OPENAI_API_KEY: "sk-test" },
      fetch: probe.fetchFn,
      cookie,
    });
    const body = await jsonBody(res);
    assert.equal(body.limited, false, `ask ${i + 1} should be allowed`);
    cookie = cookieJar(res, cookie);
  }
  assert.equal(probe.calls, ASK_SESSION_LIMIT);
  assert.match(cookie, /aegisflow_ask_n=10/);
  const blocked = await handleAsk({
    session: viewer,
    question: "One more region question",
    regionId: "el-salvador",
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: probe.fetchFn,
    cookie,
  });
  const body = await jsonBody(blocked);
  assert.equal(body.limited, true);
  assert.equal(body.hint, ASK_LIMIT_HINT);
  assert.equal(probe.calls, ASK_SESSION_LIMIT);
}

const FAKE_MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);

function ttsFetch() {
  let calls = 0;
  const urls: string[] = [];
  const fetchFn: typeof fetch = async (input) => {
    calls += 1;
    const url = String(input);
    urls.push(url);
    assert.match(url, /api\.elevenlabs\.io\/v1\/text-to-speech\//);
    assert.doesNotMatch(url, /convai|\/v1\/agents/);
    return new Response(Buffer.from(FAKE_MP3), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    });
  };
  return {
    fetchFn,
    urls,
    get calls() {
      return calls;
    },
  };
}

async function speakMissingKeyIsSim() {
  const probe = ttsFetch();
  const res = await handleAskSpeak({
    session: viewer,
    text: "Latest ask reply.",
    env: { ELEVENLABS_API_KEY: "" },
    fetch: probe.fetchFn,
    now: () => new Date("2026-09-21T00:00:00.000Z"),
  });
  const body = await jsonBody(res);
  assert.equal(body.sim, true);
  assert.equal(body.reason, "missing_key");
  assert.equal(res.headers.get("x-aegisflow-tts"), "sim");
  assert.equal(probe.calls, 0);
}

async function speakCapsSkipUpstream() {
  const probe = ttsFetch();
  const now = () => new Date("2026-09-21T08:00:00.000Z");
  const counted = await handleAskSpeak({
    session: manager,
    text: "Speak this reply.",
    env: { ELEVENLABS_API_KEY: "sk_test" },
    fetch: probe.fetchFn,
    now,
    cookie: "aegisflow_speak_day=2026-09-21.19.100",
  });
  assert.equal(counted.status, 200);
  assert.equal(counted.headers.get("content-type"), "audio/mpeg");
  assert.equal(probe.calls, 1);
  assert.match(cookieJar(counted), /aegisflow_speak_day=2026-09-21\.20\./);

  const overCount = await handleAskSpeak({
    session: manager,
    text: "Another reply.",
    env: { ELEVENLABS_API_KEY: "sk_test" },
    fetch: probe.fetchFn,
    now,
    cookie: "aegisflow_speak_day=2026-09-21.20.100",
  });
  const countBody = await jsonBody(overCount);
  assert.equal(countBody.limited, true);
  assert.equal(countBody.hint, SPEAK_LIMIT_HINT);
  assert.equal(probe.calls, 1);

  const overChars = await handleAskSpeak({
    session: viewer,
    text: "x".repeat(120),
    env: { ELEVENLABS_API_KEY: "sk_test" },
    fetch: probe.fetchFn,
    now,
    cookie: "aegisflow_speak_day=2026-09-21.2.14950",
  });
  const charBody = await jsonBody(overChars);
  assert.equal(charBody.limited, true);
  assert.equal(probe.calls, 1);

  const nextDay = await handleAskSpeak({
    session: viewer,
    text: "Fresh day.",
    env: { ELEVENLABS_API_KEY: "sk_test" },
    fetch: probe.fetchFn,
    now: () => new Date("2026-09-22T08:00:00.000Z"),
    cookie: "aegisflow_speak_day=2026-09-21.20.15000",
  });
  assert.equal(nextDay.headers.get("content-type"), "audio/mpeg");
  assert.equal(probe.calls, 2);
}

function uiWiring() {
  const top = readFileSync("src/components/ops/TopBar.tsx", "utf8");
  const regionAt = top.indexOf("{regionPicker}");
  const tourAt = top.indexOf('data-ops-tour-replay="true"', regionAt);
  const askAt = top.indexOf("onClick={onOpenAsk}", tourAt);
  const railAt = top.indexOf("ml-auto", askAt);
  assert.ok(regionAt > 0 && tourAt > regionAt && askAt > tourAt && railAt > askAt);
  assert.match(top, /OPS_WALKTHROUGH_CHROME\.replay/);
  assert.match(top, />\s*Ask\s*</);
  assert.doesNotMatch(top, /Brief aloud|BriefAloudButton/);
  assert.doesNotMatch(top, /disabled=/);

  const shell = readFileSync("src/components/ops/OpsShell.tsx", "utf8");
  assert.match(shell, /AskOpsDrawer/);
  assert.match(shell, /\.\/OpsMap/);
  assert.match(shell, /65%/);
  assert.doesNotMatch(shell, /router\.push/);

  const drawer = readFileSync("src/components/ops/AskOpsDrawer.tsx", "utf8");
  assert.match(drawer, /Speak answer/);
  assert.match(drawer, /autoSpeakRef\.current = answer/);
  assert.match(drawer, /voiceOrigin/);
  assert.match(drawer, /Speaking…/);
  assert.match(drawer, /ask-speak-pulse/);
  assert.match(drawer, /#22D3EE/);
  assert.match(drawer, /ASK_LIMIT_HINT/);
  assert.match(drawer, /SPEAK_LIMIT_HINT/);
  assert.match(drawer, /MIC_DENIED_HINT/);
  assert.match(drawer, /h-8 w-8/);
  assert.match(drawer, /#94A3B8/);
  assert.match(drawer, /ask-mic-ring/);
  assert.doesNotMatch(drawer, /#FF4D2E/);
  assert.match(drawer, /opsAskUrl/);
  assert.match(drawer, /opsAskSpeakUrl/);
  assert.match(drawer, /Escape/);
  assert.match(drawer, /Close Ask Ops/);
  assert.match(drawer, /slice\(0, 3\)/);
  assert.match(drawer, /askBriefFactsFromIncident/);
  assert.match(drawer, /shouldAutoSpeak/);
  assert.match(drawer, /voiceOrigin/);
  assert.match(drawer, /speechRecognitionCtor/);
  assert.match(drawer, /interimResults = true/);
  const form = drawer.slice(drawer.indexOf("<form"));
  const localeAt = form.indexOf("h-[22px]");
  const micAt = form.indexOf("onClick={onMic}");
  const inputAt = form.indexOf('aria-label="Ask Ops"');
  const askSubmitAt = form.indexOf('type="submit"');
  assert.ok(
    localeAt > 0 && micAt > localeAt && inputAt > micAt && askSubmitAt > inputAt,
    "Composer is ES|EN, then Mic, then text field, then Ask",
  );
  assert.match(form, /text-\[#64748B\]/);
  assert.match(form, /bg-\[#1E2A40\] text-\[#E2E8F0\]/);
  assert.match(form, /micLocaleTitle/);
  assert.match(drawer, /micLocaleSwitch/);
  assert.match(drawer, /micRecognitionLang/);
  assert.match(drawer, /saveMicLocale/);
  assert.doesNotMatch(drawer, /navigator\.language/);
  assert.doesNotMatch(drawer, /globe|🌐/);
  assert.doesNotMatch(drawer, /Spanish recognition|English recognition/);
  assert.doesNotMatch(drawer, /canDispatch/);
  assert.doesNotMatch(drawer, /toast|window\.alert|alert\(/);
  assert.doesNotMatch(drawer, /convai|\/v1\/agents|how can I help/i);
  assert.doesNotMatch(top, /speechRecognitionCtor|webkitSpeechRecognition/);

  const speak = readFileSync("src/lib/ask/speak.ts", "utf8");
  assert.match(speak, /synthesizeElevenLabs/);
  assert.doesNotMatch(speak, /convai|\/v1\/agents/);

  const speech = readFileSync("src/lib/ask/speech.ts", "utf8");
  assert.match(speech, /webkitSpeechRecognition/);
  assert.match(speech, /SpeechRecognition/);
  assert.match(speech, /Ask with voice/);
  assert.match(speech, /Mic unavailable · type instead/);
  assert.match(speech, /es-SV/);
  assert.match(speech, /es-ES/);
  assert.match(speech, /Idioma del micrófono/);
  assert.match(speech, /Mic language/);
  assert.doesNotMatch(speech, /elevenlabs|convai|\/v1\/agents/i);

  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /\.ask-mic-ring[\s\S]*1\.5s/);
  assert.match(css, /\.ask-speak-pulse[\s\S]*1\.5s/);

  const briefRoute = readFileSync("src/app/api/ops/brief-aloud/route.ts", "utf8");
  assert.match(briefRoute, /handleBriefAloud/);
  assert.doesNotMatch(briefRoute, /handleAskSpeak|ask-speak/);

  const dispatch = readFileSync("src/components/ops/DispatchList.tsx", "utf8");
  assert.match(dispatch, /canDispatch\(role\)/);

  const envExample = readFileSync(".env.example", "utf8");
  assert.match(envExample, /gpt-4o-mini/);
  assert.match(envExample, /deepseek-chat/);
  assert.match(envExample, /Speak answer/);

  const docs = readFileSync("docs/ask-ops.md", "utf8");
  assert.match(docs, /gpt-4o-mini/);
  assert.match(docs, /deepseek-chat/);
  assert.match(docs, /10/);
  assert.match(docs, /20/);
  assert.match(docs, /15,000/);
  assert.match(docs, /select-worker-secrets/);
  assert.match(docs, /Web Speech API/);
  assert.match(docs, /voice-originated|voice ask/i);
  assert.match(docs, /does not auto-Speak/);
  assert.match(docs, /no ElevenLabs conversational agent/i);
  assert.match(docs, /es-SV/);
  assert.match(docs, /es-ES/);
  assert.match(docs, /hey necesito/);
  assert.match(docs, /localStorage/);
  assert.match(docs, /\[ES\|EN\]/);
  assert.match(docs, /#64748B/);
  assert.match(docs, /#1E2A40/);
  assert.match(docs, /#E2E8F0/);
  assert.match(docs, /Idioma del micrófono/);
  assert.match(docs, /not a vector index/i);
  assert.match(docs, /explicame que esta pasando/);
  assert.match(docs, /does not add ElevenLabs speech-to-text/);

  const briefSrc = readFileSync("src/lib/ask/brief.ts", "utf8");
  assert.doesNotMatch(briefSrc, /embedding|pinecone|vector store|notion|elevenlabs/i);

  const pkg = readFileSync("package.json", "utf8");
  assert.match(pkg, /tests\/ask-ops\.check\.ts/);
}

async function main() {
  await faqWhenKeysEmpty();
  await modelPickAndFailover();
  await situationBriefSkipsModel();
  await askSessionCap();
  await speakMissingKeyIsSim();
  await speakCapsSkipUpstream();
  uiWiring();
  console.log("OK  ask ops (FAQ, gpt-4o-mini / deepseek-chat, session cap, speak cap)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
