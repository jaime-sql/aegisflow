import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canDispatch, canSpeakBrief } from "../src/lib/auth/roles";
import { OPS_REGIONS } from "../src/lib/regions";
import {
  BRIEF_MAX_CHARS,
  BRIEF_MAX_WORDS,
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_VOICE_ID,
  TTS_CACHE_KEY_PREFIX,
  TTS_CACHE_VERSION,
  briefTextHash,
  buildRadioBrief,
  handleBriefAloud,
  isElevenLabsConfigured,
  memoryTtsKv,
  parseTtsCacheEntry,
  resolveElevenLabsVoiceId,
  ttsCacheKey,
} from "../src/lib/tts/brief";

const FAKE_MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x01, 0x02, 0x03, 0x04]);

function jsonBody(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function countingFetch(audio: Uint8Array = FAKE_MP3) {
  let calls = 0;
  const fetchFn: typeof fetch = async (input) => {
    calls += 1;
    const url = String(input);
    assert.match(url, /api\.elevenlabs\.io\/v1\/text-to-speech\//);
    return new Response(Buffer.from(audio), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    });
  };
  return {
    fetchFn,
    get calls() {
      return calls;
    },
  };
}

async function readAudio(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

const manager = { role: "manager" as const };
const viewer = { role: "viewer" as const };
const sv = OPS_REGIONS["el-salvador"];

assert.equal(canSpeakBrief("manager"), true);
assert.equal(canSpeakBrief("viewer"), false);
assert.equal(canDispatch("viewer"), false);
assert.notEqual(canSpeakBrief("viewer"), true);

assert.equal(isElevenLabsConfigured({}), false);
assert.equal(isElevenLabsConfigured({ ELEVENLABS_API_KEY: "" }), false);
assert.equal(isElevenLabsConfigured({ ELEVENLABS_API_KEY: "  " }), false);
assert.equal(isElevenLabsConfigured({ ELEVENLABS_API_KEY: "sk_test" }), true);
assert.equal(resolveElevenLabsVoiceId({}), DEFAULT_ELEVENLABS_VOICE_ID);
assert.equal(resolveElevenLabsVoiceId({ ELEVENLABS_VOICE_ID: "" }), DEFAULT_ELEVENLABS_VOICE_ID);
assert.equal(resolveElevenLabsVoiceId({ ELEVENLABS_VOICE_ID: "  " }), DEFAULT_ELEVENLABS_VOICE_ID);
assert.equal(
  resolveElevenLabsVoiceId({ ELEVENLABS_VOICE_ID: "customVoice" }),
  "customVoice",
);
assert.equal(DEFAULT_ELEVENLABS_MODEL_ID, "eleven_flash_v2_5");
assert.equal(TTS_CACHE_KEY_PREFIX, "tts:");
assert.equal(ttsCacheKey(sv.incidentEventId), `tts:${sv.incidentEventId}`);
assert.equal(TTS_CACHE_VERSION, 1);

const brief = buildRadioBrief(sv.executiveSummary);
assert.match(brief, /^AegisFlow brief\./);
assert.match(brief, / Out\.$/);
assert.ok(brief.length <= BRIEF_MAX_CHARS + 8);
assert.ok(brief.split(/\s+/).length <= BRIEF_MAX_WORDS + 6);
const long = "word ".repeat(400);
const clipped = buildRadioBrief(long);
assert.ok(clipped.split(/\s+/).length <= BRIEF_MAX_WORDS + 6);
assert.ok(clipped.length < 500);
assert.equal(briefTextHash("a"), briefTextHash("a"));
assert.notEqual(briefTextHash("a"), briefTextHash("b"));

async function viewerForbidden() {
  const res = await handleBriefAloud({
    session: viewer,
    eventId: sv.incidentEventId,
    regionId: sv.id,
    env: { ELEVENLABS_API_KEY: "sk_live_should_not_be_used" },
    fetch: countingFetch().fetchFn,
    kv: memoryTtsKv(),
  });
  assert.equal(res.status, 403);
  const body = await jsonBody(res);
  assert.equal(body.error, "manager_only");
}

async function viewerDoesNotCallElevenLabs() {
  const probe = countingFetch();
  const res = await handleBriefAloud({
    session: viewer,
    eventId: sv.incidentEventId,
    regionId: sv.id,
    env: { ELEVENLABS_API_KEY: "sk_live_should_not_be_used" },
    fetch: probe.fetchFn,
    kv: memoryTtsKv(),
  });
  assert.equal(res.status, 403);
  assert.equal(probe.calls, 0);
}

async function missingKeyIsSim() {
  const probe = countingFetch();
  const res = await handleBriefAloud({
    session: manager,
    eventId: sv.incidentEventId,
    regionId: sv.id,
    env: { ELEVENLABS_API_KEY: "" },
    fetch: probe.fetchFn,
    kv: memoryTtsKv(),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-aegisflow-tts"), "sim");
  const body = await jsonBody(res);
  assert.equal(body.sim, true);
  assert.equal(body.reason, "missing_key");
  assert.equal(probe.calls, 0);
}

async function cacheHitSkipsElevenLabs() {
  const probe = countingFetch();
  const kv = memoryTtsKv();
  const env = { ELEVENLABS_API_KEY: "sk_test_key" };
  const first = await handleBriefAloud({
    session: manager,
    eventId: sv.incidentEventId,
    regionId: sv.id,
    env,
    fetch: probe.fetchFn,
    kv,
  });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "audio/mpeg");
  assert.equal(first.headers.get("x-aegisflow-tts"), "live");
  const liveBytes = await readAudio(first);
  assert.deepEqual([...liveBytes], [...FAKE_MP3]);
  assert.equal(probe.calls, 1);

  const cachedRaw = await kv.get(ttsCacheKey(sv.incidentEventId));
  const parsed = parseTtsCacheEntry(cachedRaw);
  assert.ok(parsed);
  assert.equal(parsed!.eventId, sv.incidentEventId);

  const second = await handleBriefAloud({
    session: manager,
    eventId: sv.incidentEventId,
    regionId: sv.id,
    env,
    fetch: probe.fetchFn,
    kv,
  });
  assert.equal(second.status, 200);
  assert.equal(second.headers.get("x-aegisflow-tts"), "cache");
  const cacheBytes = await readAudio(second);
  assert.deepEqual([...cacheBytes], [...FAKE_MP3]);
  assert.equal(probe.calls, 1, "cache hit must not re-call ElevenLabs");
}

async function upstreamFailureIsSim() {
  let calls = 0;
  const failing: typeof fetch = async () => {
    calls += 1;
    return new Response("nope", { status: 401 });
  };
  const res = await handleBriefAloud({
    session: manager,
    eventId: sv.incidentEventId,
    regionId: sv.id,
    env: { ELEVENLABS_API_KEY: "sk_bad" },
    fetch: failing,
    kv: memoryTtsKv(),
  });
  assert.equal(res.status, 200);
  const body = await jsonBody(res);
  assert.equal(body.sim, true);
  assert.equal(body.reason, "upstream");
  assert.equal(calls, 1);
}

async function cacheSurvivesMissingKey() {
  const probe = countingFetch();
  const text = buildRadioBrief(sv.executiveSummary);
  const voiceId = DEFAULT_ELEVENLABS_VOICE_ID;
  const modelId = DEFAULT_ELEVENLABS_MODEL_ID;
  const textHash = briefTextHash(`${voiceId}:${modelId}:${text}`);
  const seeded = memoryTtsKv({
    [ttsCacheKey(sv.incidentEventId)]: JSON.stringify({
      v: TTS_CACHE_VERSION,
      eventId: sv.incidentEventId,
      textHash,
      voiceId,
      modelId,
      contentType: "audio/mpeg",
      audioB64: Buffer.from(FAKE_MP3).toString("base64"),
      createdAt: new Date().toISOString(),
    }),
  });
  const res = await handleBriefAloud({
    session: manager,
    eventId: sv.incidentEventId,
    regionId: sv.id,
    env: { ELEVENLABS_API_KEY: "" },
    fetch: probe.fetchFn,
    kv: seeded,
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-aegisflow-tts"), "cache");
  assert.equal(probe.calls, 0, "cached clip plays after key expiry without ElevenLabs");
}

async function networkErrorIsSim() {
  const boom: typeof fetch = async () => {
    throw new Error("network down");
  };
  const res = await handleBriefAloud({
    session: manager,
    eventId: sv.incidentEventId,
    regionId: sv.id,
    env: { ELEVENLABS_API_KEY: "sk_test" },
    fetch: boom,
    kv: memoryTtsKv(),
  });
  const body = await jsonBody(res);
  assert.equal(body.sim, true);
}

async function eventMismatchIsSim() {
  const res = await handleBriefAloud({
    session: manager,
    eventId: "evt_not_this_incident",
    regionId: sv.id,
    env: { ELEVENLABS_API_KEY: "sk_test" },
    fetch: countingFetch().fetchFn,
    kv: memoryTtsKv(),
  });
  const body = await jsonBody(res);
  assert.equal(body.sim, true);
  assert.equal(body.reason, "bad_request");
}

function uiWiring() {
  const execCard = readFileSync("src/components/ops/ExecSummaryCard.tsx", "utf8");
  assert.match(execCard, /canSpeakBrief\(role\)/);
  assert.match(execCard, /BriefAloudButton/);
  assert.match(execCard, /: null\}/);
  assert.doesNotMatch(execCard, /agent rec|AgentChip/);
  assert.doesNotMatch(execCard, /Ack locked|greyed|opacity-70/);

  const briefBtn = readFileSync("src/components/ops/BriefAloudButton.tsx", "utf8");
  assert.match(briefBtn, /Speaking…/);
  assert.match(briefBtn, /SimBadge/);
  assert.match(briefBtn, /opsBriefAloudUrl/);
  assert.match(briefBtn, /state === "sim"/);
  assert.match(briefBtn, /Stop brief/);
  assert.match(briefBtn, /"Brief aloud"/);
  assert.doesNotMatch(briefBtn, /toast|window\.alert|alert\(/);

  const agentChip = readFileSync("src/components/ops/AgentChip.tsx", "utf8");
  assert.doesNotMatch(agentChip, /BriefAloudButton|Brief aloud/);

  const rail = readFileSync("src/components/ops/RightRail.tsx", "utf8");
  assert.match(rail, /ttsConfigured/);
  assert.match(rail, /role=\{role\}/);
  assert.match(rail, /ExecSummaryCard/);
  assert.doesNotMatch(rail, /BriefAloudButton|Brief aloud/);

  for (const path of [
    "src/components/ops/DispatchList.tsx",
    "src/components/ops/TopBar.tsx",
    "src/components/ops/LineageDrawer.tsx",
    "src/components/ops/OpsMap.tsx",
    "src/components/ops/ResourceBars.tsx",
    "src/components/ops/TimelineScrubber.tsx",
  ]) {
    const src = readFileSync(path, "utf8");
    assert.doesNotMatch(
      src,
      /BriefAloudButton|Brief aloud/,
      `${path} must stay out of Brief aloud (exec summary only; not Viewer rail)`,
    );
  }

  const opsPage = readFileSync("src/app/ops/page.tsx", "utf8");
  assert.match(opsPage, /isElevenLabsConfigured/);
  assert.match(opsPage, /ttsConfigured=/);

  const route = readFileSync("src/app/api/ops/brief-aloud/route.ts", "utf8");
  assert.match(route, /handleBriefAloud/);
  assert.match(route, /getOpsSession/);

  const wrangler = readFileSync("wrangler.jsonc", "utf8");
  assert.match(wrangler, /"ELEVENLABS_VOICE_ID": "21m00Tcm4TlvDq8ikWAM"/);
  assert.match(wrangler, /"ELEVENLABS_MODEL_ID": "eleven_flash_v2_5"/);
  assert.match(wrangler, /ELEVENLABS_API_KEY/);
  assert.match(wrangler, /"binding": "WIND_CACHE"/);

  const workflow = readFileSync(".github/workflows/cloudflare-prod.yml", "utf8");
  assert.match(workflow, /ELEVENLABS_API_KEY/);
  assert.match(
    workflow,
    /secrets: \|[\s\S]*ELEVENLABS_API_KEY[\s\S]*ELEVENLABS_VOICE_ID/,
  );
  assert.match(
    workflow,
    /secrets\.ELEVENLABS_VOICE_ID \|\| '21m00Tcm4TlvDq8ikWAM'/,
  );

  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /ELEVENLABS_API_KEY: ""/);

  const envExample = readFileSync(".env.example", "utf8");
  assert.match(envExample, /ELEVENLABS_API_KEY=/);
  assert.match(envExample, /ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM/);
  assert.match(envExample, /Rachel|21m00Tcm4TlvDq8ikWAM/);

  const docs = readFileSync("docs/brief-aloud.md", "utf8");
  assert.match(docs, /21m00Tcm4TlvDq8ikWAM/);
  assert.match(docs, /Manager only/);
  assert.match(docs, /tts:<eventId>/);
  assert.match(docs, /Acceptance \(Design \+ QA\)/);
  assert.match(docs, /Viewer never sees/);
  assert.match(docs, /Speaking…/);
  assert.match(docs, /no toast spam/);
  assert.match(docs, /Same `eventId` replay hits cache/);

  const pkg = readFileSync("package.json", "utf8");
  assert.match(pkg, /tests\/brief-aloud\.check\.ts/);
}

async function main() {
  await viewerForbidden();
  await viewerDoesNotCallElevenLabs();
  await missingKeyIsSim();
  await cacheHitSkipsElevenLabs();
  await upstreamFailureIsSim();
  await cacheSurvivesMissingKey();
  await networkErrorIsSim();
  await eventMismatchIsSim();
  uiWiring();
  console.log("OK  brief aloud (manager gate, SIM, cache hit, exec-summary-only)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
