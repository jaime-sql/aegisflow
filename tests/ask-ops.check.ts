import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAskOps, canDispatch, canSpeakBrief } from "../src/lib/auth/roles";
import { opsAskSpeakUrl, opsAskUrl } from "../src/lib/base-path";
import { DEEPSEEK_MODEL, OPENAI_MODEL } from "../src/lib/agents/runtime";
import { handleAsk } from "../src/lib/ask/answer";
import { answerFaq, classifyAskQuestion } from "../src/lib/ask/faq";
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
import { ASK_DEEPSEEK_MODEL, ASK_OPENAI_MODEL } from "../src/lib/ask/models";
import { handleAskSpeak } from "../src/lib/ask/speak";
import { loadAskCount, saveAskCount, loadSpeakQuota, saveSpeakQuota } from "../src/lib/ask/storage";
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
assert.equal(SPEAK_LIMIT_HINT, "Daily limit");
assert.match(OPS_ASK_HELP, /Layers/);
assert.match(OPS_ASK_HELP, /Lineage/);
assert.match(OPS_ASK_HELP, /Manager-only/);
assert.match(OPS_ASK_HELP, /Region/);
assert.match(OPS_ASK_HELP, /Feeds/);

assert.equal(canAskOps("manager"), true);
assert.equal(canAskOps("viewer"), true);
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

assert.equal(classifyAskQuestion("What is the capital of France?"), "scope");
const scope = answerFaq("What is the capital of France?", sv);
assert.match(scope, /only covers this incident/);
assert.match(scope, /layers, lineage, roles, region, feeds/);
assert.doesNotMatch(scope, /Paris/);
assert.match(answerFaq("How do I toggle layers?", sv), /Hotspots/);
assert.match(answerFaq("Who can ack dispatch?", sv), /Manager-only/);
assert.match(answerFaq("What's the situation?", sv), /El Salvador WUI watch/);

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
  assert.match(String(faqBody.answer), /only covers this incident/);
  assert.doesNotMatch(String(faqBody.answer), /Paris/);
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
  assert.match(drawer, /ASK_LIMIT_HINT/);
  assert.match(drawer, /SPEAK_LIMIT_HINT/);
  assert.match(drawer, /opsAskUrl/);
  assert.match(drawer, /opsAskSpeakUrl/);
  assert.match(drawer, /Escape/);
  assert.match(drawer, /Close Ask Ops/);
  assert.match(drawer, /slice\(0, 3\)/);
  assert.doesNotMatch(drawer, /toast|window\.alert|alert\(/);
  assert.doesNotMatch(drawer, /convai|\/v1\/agents/);

  const speak = readFileSync("src/lib/ask/speak.ts", "utf8");
  assert.match(speak, /synthesizeElevenLabs/);
  assert.doesNotMatch(speak, /convai|\/v1\/agents/);

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

  const pkg = readFileSync("package.json", "utf8");
  assert.match(pkg, /tests\/ask-ops\.check\.ts/);
}

async function main() {
  await faqWhenKeysEmpty();
  await modelPickAndFailover();
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
