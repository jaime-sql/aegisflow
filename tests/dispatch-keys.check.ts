import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { runAllAgents } from "../src/lib/agents";
import { loadOpsIncident } from "../src/lib/incident/load";
import { dispatchListKeys, type DispatchKeyInput } from "../src/lib/ui/dispatch-keys";
import type { IngestFetch } from "../src/lib/ingest/types";
import type { AgentOutput, DispatchAction, Hotspot, WindTick } from "../src/lib/schema";

type DispatchListItem = DispatchKeyInput & { action: DispatchAction };

type DispatchListComponent = (props: {
  items: DispatchListItem[];
  role: "manager" | "viewer";
}) => ReactElement;

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

function duplicatePayload(): unknown {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            summary: "Evacuate the grids that sit inside the 6h envelope.",
            confidence: 0.8,
            recommendations: [
              {
                actionId: "evacuate-affected-areas",
                label: "Evacuate affected areas",
                detail: "Move residents off the downwind grids.",
                priority: "P1",
              },
              {
                actionId: "evacuate-affected-areas",
                label: "Evacuate affected areas again",
                detail: "Same id repeated inside one agent payload.",
                priority: "P2",
              },
            ],
          }),
        },
      },
    ],
  };
}

function flattened(agents: AgentOutput[]) {
  return agents.flatMap((agent) =>
    agent.recommendations.map((action, index) => ({ action, agent, index })),
  );
}

function assertDistinctActionIds(agents: AgentOutput[], label: string) {
  const rows = flattened(agents);
  const ids = rows.map((row) => row.action.actionId);
  assert.equal(new Set(ids).size, ids.length, `${label} actionIds must be unique`);
  const items: DispatchListItem[] = rows.map((row) => ({
    action: row.action,
    agentId: row.agent.agentId,
    eventId: row.agent.eventId,
  }));
  const keys = dispatchListKeys(items);
  assert.equal(new Set(keys).size, keys.length, `${label} dispatch keys must be unique`);
  assert.equal(
    keys.some((key, index) => key === ids[index]),
    false,
    "dispatch keys must not be the bare actionId",
  );
}

async function liveDuplicateActionIdsGainSuffix() {
  const doFetch: IngestFetch = async () =>
    new Response(JSON.stringify(duplicatePayload()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const result = await runAllAgents(
    {
      incidentId: "SV-WUI",
      incidentEventId: "evt_svwui_incident",
      regionName: "El Salvador — national WUI",
      hotspots: HOTSPOTS,
      wind: WIND,
    },
    { env: { OPENAI_API_KEY: "sk-test" }, fetch: doFetch },
  );
  const rows = flattened(result.agents);
  assert.equal(rows.length, 6);
  assertDistinctActionIds(result.agents, "live duplicate payload");
  const bare = rows.filter((row) => row.action.actionId === "evacuate-affected-areas");
  assert.equal(bare.length, 1);
  for (const row of rows) {
    const id = row.action.actionId;
    if (id === "evacuate-affected-areas") continue;
    assert.match(id, /^evacuate-affected-areas:/);
    const distinguished =
      id.includes(row.agent.agentId) ||
      id.includes(row.agent.eventId) ||
      id.includes(`:${row.index}`);
    assert.equal(distinguished, true, id);
  }
}

async function fixturesStayUniqueWithoutRewriting() {
  const incident = await loadOpsIncident("el-salvador", {
    firms: { env: {} },
    wind: { env: {} },
    agents: { env: {} },
  });
  assertDistinctActionIds(incident.agents, "SV-WUI fixture");
  const ids = incident.agents.flatMap((agent) => agent.recommendations.map((action) => action.actionId));
  for (const stable of ["prop-hold-north", "evac-hwy20", "res-engines"]) {
    assert.ok(ids.includes(stable), stable);
  }

  const cascade = await loadOpsIncident("cascade", {
    firms: { env: {} },
    wind: { env: {} },
    agents: { env: {} },
  });
  assertDistinctActionIds(cascade.agents, "cascade fixture");
  assert.ok(
    cascade.agents.some((agent) =>
      agent.recommendations.some((action) => action.actionId === "prop-hold-north"),
    ),
  );

  const fixture = JSON.parse(readFileSync("fixtures/aegisfire-01.json", "utf8")) as {
    agents: Array<{ recommendations: Array<{ actionId: string }> }>;
  };
  const fileIds = fixture.agents.flatMap((agent) => agent.recommendations.map((action) => action.actionId));
  assert.equal(new Set(fileIds).size, fileIds.length);
}

async function loadDispatchList(): Promise<DispatchListComponent> {
  const cache = join(process.cwd(), "node_modules", ".cache");
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, "dispatch-keys-"));
  const outfile = join(dir, "DispatchList.mjs");
  try {
    await build({
      absWorkingDir: process.cwd(),
      entryPoints: ["src/components/ops/DispatchList.tsx"],
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      outfile,
      external: ["react", "react/jsx-runtime", "react/jsx-dev-runtime"],
    });
    const mod = (await import(pathToFileURL(outfile).href)) as { DispatchList: DispatchListComponent };
    return mod.DispatchList;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function renderedKeysStayUnique() {
  const DispatchList = await loadDispatchList();
  const items: DispatchListItem[] = [
    {
      action: {
        actionId: "evacuate-affected-areas",
        label: "First evac",
        detail: "Downwind grids.",
        priority: "P1",
      },
      agentId: "evacuation",
      eventId: "evt_svwui_agent_evacuation",
    },
    {
      action: {
        actionId: "evacuate-affected-areas",
        label: "Second evac",
        detail: "Propagation copy.",
        priority: "P1",
      },
      agentId: "fire-propagation",
      eventId: "evt_svwui_agent_propagation",
    },
    {
      action: {
        actionId: "evacuate-affected-areas",
        label: "Third evac",
        detail: "Same agent, same id.",
        priority: "P2",
      },
      agentId: "evacuation",
      eventId: "evt_svwui_agent_evacuation",
    },
  ];
  const keys = dispatchListKeys(items);
  assert.deepEqual(keys, [
    "evacuate-affected-areas:evacuation",
    "evacuate-affected-areas:fire-propagation",
    "evacuate-affected-areas:evt_svwui_agent_evacuation",
  ]);
  assert.equal(new Set(keys).size, keys.length);

  const manager = renderToStaticMarkup(
    createElement(DispatchList, { items, role: "manager" }),
  );
  const viewer = renderToStaticMarkup(
    createElement(DispatchList, { items, role: "viewer" }),
  );
  assert.match(manager, /First evac/);
  assert.match(manager, /Second evac/);
  assert.match(manager, /Third evac/);
  assert.match(manager, />Ack</);
  assert.match(manager, />Assign</);
  assert.doesNotMatch(manager, /Ack locked/);
  assert.match(viewer, /Ack locked/);
  assert.match(viewer, /Assign locked/);
  const listKeys = [...manager.matchAll(/data-dispatch-key="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(listKeys, keys);
}

function ackAssignStillBoundToActionId() {
  const dispatch = readFileSync("src/components/ops/DispatchList.tsx", "utf8");
  assert.match(dispatch, /dispatchListKeys\(items\)/);
  assert.match(dispatch, /key=\{keys\[index\]\}/);
  assert.match(dispatch, /state\[action\.actionId\]/);
  assert.match(dispatch, /\[action\.actionId\]: "acked"/);
  assert.match(dispatch, /\[action\.actionId\]: "assigned"/);
  assert.match(dispatch, /canDispatch\(role\)/);
  assert.doesNotMatch(dispatch, /key=\{action\.actionId\}/);
  const rail = readFileSync("src/components/ops/RightRail.tsx", "utf8");
  assert.match(rail, /agentId: agent\.agentId/);
  assert.match(rail, /eventId: agent\.eventId/);
  const pkg = readFileSync("package.json", "utf8");
  assert.match(pkg, /tests\/dispatch-keys\.check\.ts/);
}

async function main() {
  await liveDuplicateActionIdsGainSuffix();
  await   fixturesStayUniqueWithoutRewriting();
  await renderedKeysStayUnique();
  ackAssignStillBoundToActionId();
  console.log("OK  dispatch list keys (unique actionId suffix + resilient React key)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
