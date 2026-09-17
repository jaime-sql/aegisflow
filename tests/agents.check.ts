import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runAllAgents, runFirePropagation } from "../src/lib/agents";
import { agentEventId } from "../src/lib/agents/ids";
import { loadOpsIncident } from "../src/lib/incident/load";
import { parseIncidentEvent } from "../src/lib/schema/zod";
import { agentIsSim } from "../src/lib/ui/status";
import type { IngestFetch } from "../src/lib/ingest/types";
import type { AgentRunInput } from "../src/lib/agents/types";
import type { Hotspot, WindTick } from "../src/lib/schema";

const AGENT_ENV = [
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "MODAL_ENDPOINT",
  "MODAL_TOKEN_ID",
  "MODAL_TOKEN_SECRET",
  "AEGISFLOW_LIVE_LLM",
  "AEGISFLOW_USE_AGENT_FIXTURE",
  "AEGISFLOW_FAIL_AGENTS",
] as const;

function stashEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of AGENT_ENV) saved[key] = process.env[key];
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of AGENT_ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function clearAgentEnv(): Record<string, string | undefined> {
  return {};
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function llmPayload(summary: string, actionId: string): unknown {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            summary,
            confidence: 0.81,
            recommendations: [
              {
                actionId,
                label: "Hold the downwind flank",
                detail: "Construct line before the 6h envelope reaches WUI.",
                priority: "P1",
                resourceHint: "Type 1 crews",
              },
            ],
          }),
        },
      },
    ],
  };
}

const HOTSPOTS: Hotspot[] = [
  {
    eventId: "evt_aegisfire01_live_test1",
    schemaVersion: "1.0.0",
    lat: 13.7942,
    lon: -89.5011,
    brightnessK: 361.2,
    confidence: "high",
    frpMw: 41,
    observedAt: "2026-09-16T18:54:00.000Z",
    source: "NASA_FIRMS",
  },
  {
    eventId: "evt_aegisfire01_live_test2",
    schemaVersion: "1.0.0",
    lat: 13.821,
    lon: -89.372,
    brightnessK: 348.8,
    confidence: "nominal",
    frpMw: 22.4,
    observedAt: "2026-09-16T18:54:00.000Z",
    source: "NASA_FIRMS",
  },
];

const WIND: WindTick[] = [
  {
    eventId: "evt_aegisfire01_wn_test1",
    schemaVersion: "1.0.0",
    lat: 13.79,
    lon: -89.5,
    speedMps: 11.2,
    directionDeg: 240,
    gustMps: 16,
    observedAt: "2026-09-16T19:00:00.000Z",
    source: "WEATHERNEXT",
  },
];

const INPUT: AgentRunInput = {
  incidentId: "SV-WUI",
  incidentEventId: "evt_svwui_incident",
  regionName: "El Salvador — national WUI",
  hotspots: HOTSPOTS,
  wind: WIND,
};

async function fixtureWithoutKeys() {
  const result = await runAllAgents(INPUT, { env: clearAgentEnv() });
  assert.equal(result.agents.length, 3);
  assert.equal(result.health.status, "ok");
  assert.match(result.health.detail, /no OPENAI_API_KEY/);
  for (const agent of result.agents) {
    assert.equal(agent.model.used, "fixture");
    assert.equal(agent.model.runtime, "local");
    assert.equal(agent.degraded, undefined);
    assert.ok(agent.confidence >= 0.7);
    assert.equal(agentIsSim(agent), true);
    assert.equal(agent.incidentId, "SV-WUI");
    assert.match(agent.eventId, /^evt_svwui_agent_/);
    const hotspotIds = agent.lineage.filter((l) => l.kind === "hotspot").map((l) => l.eventId);
    assert.ok(hotspotIds.some((id) => id === "evt_aegisfire01_live_test1"));
    assert.ok(agent.recommendations.length >= 1);
  }
  assert.equal(result.agents[0]?.eventId, "evt_svwui_agent_propagation");
  assert.equal(result.agents[1]?.eventId, "evt_svwui_agent_evacuation");
  assert.equal(result.agents[2]?.eventId, "evt_svwui_agent_resources");
  parseIncidentEvent(minimalIncident(result.agents));
}

function minimalIncident(agents: ReturnType<typeof parseIncidentEvent>["agents"]) {
  return {
    eventId: "evt_svwui_incident",
    schemaVersion: "1.0.0",
    incidentId: "SV-WUI",
    name: "test",
    status: "active" as const,
    region: {
      id: "el-salvador" as const,
      name: "ES",
      placeholder: false,
      center: { lat: 13.6929, lon: -89.2182 },
      bbox: [-90.2, 13.1, -87.65, 14.48] as [number, number, number, number],
    },
    startedAt: "2026-09-16T16:00:00.000Z",
    updatedAt: "2026-09-16T19:00:00.000Z",
    executiveSummary: "test",
    hotspots: HOTSPOTS,
    wind: WIND,
    agents,
    feedHealth: {
      eventId: "evt_svwui_feed_health",
      schemaVersion: "1.0.0",
      overall: "ok" as const,
      feeds: [],
      producedAt: "2026-09-16T19:00:00.000Z",
    },
    timeline: [],
    resources: [],
  };
}

async function cascadeKeepsStableIds() {
  const prop = await runFirePropagation(
    {
      incidentId: "AegisFire-01",
      incidentEventId: "evt_aegisfire01_incident",
      hotspots: HOTSPOTS,
      wind: WIND,
    },
    { env: clearAgentEnv() },
  );
  assert.equal(prop.eventId, "evt_aegisfire01_agent_propagation");
  assert.equal(agentEventId("AegisFire-01", "fire-propagation"), "evt_aegisfire01_agent_propagation");
  assert.match(prop.summary, /Sisters|Hwy 20|Whychus/);
}

async function openaiLive() {
  const urls: string[] = [];
  const doFetch: IngestFetch = async (input) => {
    urls.push(String(input));
    return jsonResponse(llmPayload("Live propagation envelope toward the metro WUI grid.", "prop-hold"));
  };
  const result = await runAllAgents(INPUT, {
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: doFetch,
  });
  assert.equal(result.health.status, "ok");
  assert.match(result.health.detail, /openai/);
  assert.equal(result.agents[0]?.model.used, "openai");
  assert.equal(result.agents[0]?.model.runtime, "local");
  assert.equal(result.agents[0]?.degraded, undefined);
  assert.equal(agentIsSim(result.agents[0]!), false);
  assert.match(result.agents[0]!.summary, /Live propagation/);
  assert.equal(result.agents[0]!.eventId, "evt_svwui_agent_propagation");
  assert.ok(urls.some((u) => u.includes("api.openai.com")));
  parseIncidentEvent(minimalIncident(result.agents));
}

async function deepseekFallback() {
  const urls: string[] = [];
  const doFetch: IngestFetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("openai.com")) return jsonResponse({ error: "nope" }, 500);
    return jsonResponse(llmPayload("DeepSeek backup corridor plan for CA-1 egress.", "evac-ca1"));
  };
  const result = await runAllAgents(INPUT, {
    env: {
      OPENAI_API_KEY: "sk-test",
      DEEPSEEK_API_KEY: "ds-test",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    },
    fetch: doFetch,
  });
  assert.equal(result.agents[0]?.model.used, "deepseek");
  assert.equal(agentIsSim(result.agents[0]!), false);
  assert.ok(urls.some((u) => u.includes("openai.com")));
  assert.ok(urls.some((u) => u.includes("api.deepseek.com")));
}

async function modalPreferred() {
  const urls: string[] = [];
  const doFetch: IngestFetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("modal.run")) {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Modal-Key"), "wk-test");
      assert.equal(headers.get("Modal-Secret"), "ws-test");
      const body = JSON.parse(String(init?.body ?? "{}")) as { eventId?: string; agentId?: string };
      assert.match(body.eventId ?? "", /^evt_svwui_agent_/);
      return jsonResponse({
        eventId: "evt_forged_should_be_ignored",
        summary: "Modal worker propagation using the request lineage.",
        confidence: 0.77,
        recommendations: [
          {
            actionId: "modal-anchor",
            label: "Anchor from Modal",
            detail: "Uses pre-assigned eventIds.",
            priority: "P1",
          },
        ],
        used: "openai",
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const result = await runAllAgents(INPUT, {
    env: {
      MODAL_ENDPOINT: "https://aegisflow-agents-run-agent.modal.run",
      MODAL_TOKEN_ID: "wk-test",
      MODAL_TOKEN_SECRET: "ws-test",
      OPENAI_API_KEY: "sk-should-not-be-used",
    },
    fetch: doFetch,
  });
  assert.equal(result.health.status, "ok");
  assert.equal(result.agents[0]?.model.runtime, "modal");
  assert.equal(result.agents[0]?.model.used, "openai");
  assert.equal(result.agents[0]?.eventId, "evt_svwui_agent_propagation");
  assert.doesNotMatch(result.agents[0]!.eventId, /forged/);
  assert.ok(urls.every((u) => u.includes("modal.run")));
}

async function modalFailUsesFixtureHonestly() {
  const doFetch: IngestFetch = async () => jsonResponse({ error: "cold" }, 503);
  const result = await runAllAgents(INPUT, {
    env: { MODAL_ENDPOINT: "https://aegisflow-agents-run-agent.modal.run" },
    fetch: doFetch,
  });
  assert.equal(result.health.status, "degraded");
  assert.match(result.health.detail, /fixture in use/i);
  assert.equal(result.agents.length, 3);
  for (const agent of result.agents) {
    assert.equal(agent.model.used, "fixture");
    assert.equal(agent.degraded, true);
    assert.ok(agent.confidence <= 0.4);
    assert.equal(agentIsSim(agent), true);
    assert.ok(agent.recommendations.length >= 1);
  }
}

async function llmFailCapsConfidence() {
  const doFetch: IngestFetch = async () => jsonResponse({ error: "quota" }, 429);
  const result = await runAllAgents(INPUT, {
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: doFetch,
  });
  assert.equal(result.health.status, "degraded");
  assert.equal(result.agents[0]?.degraded, true);
  assert.ok(result.agents[0]!.confidence <= 0.4);
  assert.equal(result.agents[0]!.model.used, "fixture");
}

async function forcedDownKeepsDispatch() {
  const result = await runAllAgents(INPUT, {
    env: { AEGISFLOW_FAIL_AGENTS: "true", OPENAI_API_KEY: "sk-test" },
  });
  assert.equal(result.health.status, "down");
  assert.equal(result.agents.length, 3);
  assert.ok(result.agents[0]!.recommendations.length >= 1);
}

async function loadIncidentFixtureAgents() {
  const saved = stashEnv();
  try {
    for (const key of AGENT_ENV) delete process.env[key];
    const incident = await loadOpsIncident("el-salvador");
    parseIncidentEvent(incident);
    assert.equal(incident.agents.length, 3);
    assert.equal(incident.agents[0]?.eventId, "evt_svwui_agent_propagation");
    const hotspotIds = new Set(incident.hotspots.map((h) => h.eventId));
    for (const src of incident.agents[0]!.lineage.filter((l) => l.kind === "hotspot")) {
      assert.equal(hotspotIds.has(src.eventId), true, src.eventId);
    }
    const feed = incident.feedHealth.feeds.find((f) => f.id === "agents");
    assert.equal(feed?.status, "ok");
    assert.equal(agentIsSim(incident.agents[0]!), true);
  } finally {
    restoreEnv(saved);
  }
}

async function ackAssignStillBound() {
  const incident = await loadOpsIncident("cascade", {
    agents: { env: clearAgentEnv() },
  });
  const actions = incident.agents.flatMap((a) => a.recommendations);
  assert.ok(actions.length >= 5);
  const ids = new Set(actions.map((a) => a.actionId));
  assert.equal(ids.size, actions.length);
  assert.ok(actions.some((a) => a.actionId === "prop-hold-north"));
}

function uiWiring() {
  const chip = readFileSync("src/components/ops/AgentChip.tsx", "utf8");
  assert.match(chip, /agentIsSim/);
  assert.match(chip, /SimBadge/);
  assert.match(chip, /conf \{agent\.confidence/);
  assert.doesNotMatch(chip, /model\.used/);
  assert.doesNotMatch(chip, /Fixture|Degraded|Live openai/);
  const badge = readFileSync("src/components/ops/SimBadge.tsx", "utf8");
  assert.match(badge, /SIM/);
  assert.match(badge, /#3DB9FF/);
  const status = readFileSync("src/lib/ui/status.ts", "utf8");
  assert.match(status, /agentIsSim/);
  const drawer = readFileSync("src/components/ops/LineageDrawer.tsx", "utf8");
  assert.match(drawer, /same NASA FIRMS hotspot/);
  assert.match(drawer, /SimBadge/);
  const dispatch = readFileSync("src/components/ops/DispatchList.tsx", "utf8");
  assert.match(dispatch, /Ack/);
  assert.match(dispatch, /Assign/);
  const rail = readFileSync("src/components/ops/RightRail.tsx", "utf8");
  const execAt = rail.indexOf("<ExecSummaryCard");
  const agentsAt = rail.indexOf("Agents");
  const dispatchAt = rail.indexOf("<DispatchList");
  assert.ok(execAt >= 0 && agentsAt > execAt && dispatchAt > agentsAt);
  assert.doesNotMatch(rail, /Agent status|Agent runtime|fourth/i);
  const worker = readFileSync("workers/modal_stub.py", "utf8");
  assert.match(worker, /fastapi_endpoint/);
  assert.match(worker, /requires_proxy_auth/);
  assert.match(worker, /handle_run_agent/);
  const envExample = readFileSync(".env.example", "utf8");
  assert.match(envExample, /OPENAI_API_KEY=/);
  assert.match(envExample, /DEEPSEEK_API_KEY=/);
  assert.match(envExample, /MODAL_ENDPOINT=/);
  const docs = readFileSync("docs/agents.md", "utf8");
  assert.match(docs, /What Jaime must set/);
  assert.match(docs, /OPENAI_API_KEY/);
  assert.match(docs, /SimBadge|SIM/);
  const workflow = readFileSync(".github/workflows/cloudflare-prod.yml", "utf8");
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /DEEPSEEK_API_KEY/);
  assert.match(workflow, /MODAL_TOKEN_SECRET/);
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /OPENAI_API_KEY/);
}

function pythonWorkerCompiles() {
  execFileSync("python3", ["-m", "py_compile", "workers/modal_stub.py"], { stdio: "pipe" });
  const out = execFileSync("python3", ["workers/modal_stub.py"], { encoding: "utf8" });
  assert.match(out, /evt_aegisfire01_agent_propagation/);
  assert.match(out, /openai \(primary\) \/ deepseek \(backup\)/);
}

async function main() {
  await fixtureWithoutKeys();
  await cascadeKeepsStableIds();
  await openaiLive();
  await deepseekFallback();
  await modalPreferred();
  await modalFailUsesFixtureHonestly();
  await llmFailCapsConfidence();
  await forcedDownKeepsDispatch();
  await loadIncidentFixtureAgents();
  await ackAssignStillBound();
  uiWiring();
  pythonWorkerCompiles();
  console.log("OK  live agents (Modal + OpenAI/DeepSeek) with fixture fallback");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
