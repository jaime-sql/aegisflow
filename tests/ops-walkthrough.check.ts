import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canDispatch, canSpeakBrief } from "../src/lib/auth/roles";
import {
  OPS_TOUR_ATTR,
  OPS_WALKTHROUGH_CHROME,
  OPS_WALKTHROUGH_COPY,
  OPS_WALKTHROUGH_STORAGE_KEY,
  OPS_WALKTHROUGH_STORAGE_VALUE,
  OPS_WALKTHROUGH_TARGETS,
  clearOpsWalkthroughDismissal,
  dismissOpsWalkthrough,
  isOpsWalkthroughDismissed,
  opsTourSelector,
  opsWalkthroughSteps,
  type WalkthroughStore,
} from "../src/lib/ui/ops-walkthrough";

function memoryStore(init?: Record<string, string>): WalkthroughStore & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(init ?? {}));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function copyIsDesignVerbatim() {
  assert.equal(
    OPS_WALKTHROUGH_COPY.region.body,
    "Switch El Salvador ↔ Cascade for the demo scenario.",
  );
  assert.equal(
    OPS_WALKTHROUGH_COPY["map-layers"].body,
    "Toggle Hotspots / Wind / Agents; feed age stays honest (LIVE vs DEMO FIXTURE / Wind · fallback).",
  );
  assert.equal(
    OPS_WALKTHROUGH_COPY["agents-lineage"].body,
    "Open a chip, then View lineage — same `eventId`s as the map.",
  );
  assert.equal(OPS_WALKTHROUGH_COPY.dispatch.managerBody, "Ack / Assign here.");
  assert.equal(
    OPS_WALKTHROUGH_COPY.dispatch.viewerBody,
    "Actions locked — you're viewing only.",
  );
  assert.equal(
    OPS_WALKTHROUGH_COPY["brief-aloud"].body,
    "Exec Summary Brief aloud.",
  );
  assert.equal(OPS_WALKTHROUGH_CHROME.skip, "Skip");
  assert.equal(OPS_WALKTHROUGH_CHROME.dontShowAgain, "Don't show again");
  assert.equal(OPS_WALKTHROUGH_CHROME.replay, "Tour");
}

function fiveStepsBothRoles() {
  const manager = opsWalkthroughSteps("manager");
  const viewer = opsWalkthroughSteps("viewer");

  assert.equal(manager.length, 5);
  assert.equal(viewer.length, 5);
  assert.deepEqual(
    manager.map((s) => s.id),
    [...OPS_WALKTHROUGH_TARGETS],
  );
  assert.deepEqual(
    viewer.map((s) => s.id),
    [...OPS_WALKTHROUGH_TARGETS],
  );
  assert.equal(manager[4]?.id, "brief-aloud");
  assert.equal(viewer[4]?.id, "brief-aloud");
  assert.equal(viewer[4]?.title, "Brief aloud");
  assert.equal(viewer[4]?.body, "Exec Summary Brief aloud.");
  assert.equal(manager[4]?.body, viewer[4]?.body);

  assert.equal(manager[0]?.body, OPS_WALKTHROUGH_COPY.region.body);
  assert.equal(manager[1]?.body, OPS_WALKTHROUGH_COPY["map-layers"].body);
  assert.equal(manager[2]?.body, OPS_WALKTHROUGH_COPY["agents-lineage"].body);
  assert.equal(manager[3]?.body, "Ack / Assign here.");
  assert.equal(viewer[3]?.body, "Actions locked — you're viewing only.");
  assert.equal(viewer[0]?.body, manager[0]?.body);
  assert.equal(viewer[1]?.body, manager[1]?.body);
  assert.equal(viewer[2]?.body, manager[2]?.body);
}

function rolesStaySplit() {
  assert.equal(canSpeakBrief("manager"), true);
  assert.equal(canSpeakBrief("viewer"), true);
  assert.equal(canDispatch("manager"), true);
  assert.equal(canDispatch("viewer"), false);
}

function storageOncePerBrowser() {
  const empty = memoryStore();
  assert.equal(isOpsWalkthroughDismissed(empty), false);
  dismissOpsWalkthrough(empty);
  assert.equal(isOpsWalkthroughDismissed(empty), true);
  assert.equal(
    empty.data.get(OPS_WALKTHROUGH_STORAGE_KEY),
    OPS_WALKTHROUGH_STORAGE_VALUE,
  );

  const already = memoryStore({
    [OPS_WALKTHROUGH_STORAGE_KEY]: OPS_WALKTHROUGH_STORAGE_VALUE,
  });
  assert.equal(isOpsWalkthroughDismissed(already), true);

  assert.equal(isOpsWalkthroughDismissed(null), true);

  const exploding: WalkthroughStore = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(isOpsWalkthroughDismissed(exploding), true);
  assert.doesNotThrow(() => dismissOpsWalkthrough(exploding));

  clearOpsWalkthroughDismissal(already);
  assert.equal(isOpsWalkthroughDismissed(already), false);
  assert.equal(already.data.has(OPS_WALKTHROUGH_STORAGE_KEY), false);
  dismissOpsWalkthrough(already);
  assert.equal(isOpsWalkthroughDismissed(already), true);

  assert.doesNotThrow(() => clearOpsWalkthroughDismissal(null));
  assert.doesNotThrow(() => clearOpsWalkthroughDismissal(exploding));
  assert.equal(isOpsWalkthroughDismissed(exploding), true);
}

function uiWiring() {
  const tour = readFileSync("src/components/ops/OpsWalkthrough.tsx", "utf8");
  assert.match(tour, /OPS_WALKTHROUGH_CHROME\.skip/);
  assert.match(tour, /OPS_WALKTHROUGH_CHROME\.dontShowAgain/);
  assert.match(tour, /dismissOpsWalkthrough/);
  assert.match(tour, /createPortal/);
  assert.match(tour, /data-ops-walkthrough/);
  assert.doesNotMatch(tour, /judge-path|judge path/i);
  assert.doesNotMatch(tour, /dossier/i);

  const shell = readFileSync("src/components/ops/OpsShell.tsx", "utf8");
  assert.match(shell, /OpsWalkthrough/);
  assert.match(shell, /role=\{session\.role\}/);
  assert.match(shell, /clearOpsWalkthroughDismissal\(\)/);
  assert.match(shell, /onReplayTour=\{replayOpsWalkthrough\}/);
  assert.match(shell, /<OpsWalkthrough key=\{walkthroughKey\} role=\{session\.role\} \/>/);
  assert.doesNotMatch(shell, /fetch\(/);
  assert.doesNotMatch(shell, /router\.(push|replace)/);

  const top = readFileSync("src/components/ops/TopBar.tsx", "utf8");
  assert.match(top, /data-ops-tour="region"/);
  assert.match(top, /OPS_WALKTHROUGH_CHROME\.replay/);
  const regionAt = top.indexOf('data-ops-tour="region"');
  const replayAt = top.indexOf('data-ops-tour-replay="true"');
  const feedsAt = top.indexOf('className="ml-auto');
  assert.ok(regionAt >= 0 && replayAt > regionAt && feedsAt > replayAt);
  const replaySlice = top.slice(replayAt, feedsAt);
  assert.match(replaySlice, /type="button"/);
  assert.match(replaySlice, /onClick=\{onReplayTour\}/);
  assert.doesNotMatch(replaySlice, /session\.role/);
  assert.doesNotMatch(replaySlice, /href=|fetch\(|withBasePath|\/ops|disabled=/);

  const legend = readFileSync("src/components/ops/MapLegendStack.tsx", "utf8");
  assert.match(legend, /data-ops-tour="map-layers"/);

  const rail = readFileSync("src/components/ops/RightRail.tsx", "utf8");
  assert.match(rail, /data-ops-tour="agents-lineage"/);
  assert.doesNotMatch(rail, /data-ops-tour-replay|onReplayTour/);

  const dispatch = readFileSync("src/components/ops/DispatchList.tsx", "utf8");
  assert.match(dispatch, /data-ops-tour="dispatch"/);
  assert.match(dispatch, /canDispatch\(role\)/);
  assert.match(dispatch, /Ack locked/);

  const brief = readFileSync("src/components/ops/BriefAloudButton.tsx", "utf8");
  assert.match(brief, /data-ops-tour="brief-aloud"/);
  assert.match(brief, /Stop brief/);

  const exec = readFileSync("src/components/ops/ExecSummaryCard.tsx", "utf8");
  assert.match(exec, /canSpeakBrief\(role\)/);
  assert.match(exec, /BriefAloudButton/);

  assert.equal(opsTourSelector("region"), `[${OPS_TOUR_ATTR}="region"]`);

  const lib = readFileSync("src/lib/ui/ops-walkthrough.ts", "utf8");
  assert.match(lib, /export function opsWalkthroughSteps\(role: OpsRole\)/);
  assert.doesNotMatch(lib, /Viewer tour ends after step 4/);
  assert.doesNotMatch(lib, /dossier/i);

  const pkg = readFileSync("package.json", "utf8");
  assert.match(pkg, /tests\/ops-walkthrough\.check\.ts/);

  for (const extra of ["Fabric", "ElevenLabs pack", "FIRMS WMS"]) {
    assert.equal(
      opsWalkthroughSteps("manager").some((s) => s.body.includes(extra)),
      false,
      `must not invent extra copy: ${extra}`,
    );
  }
}

function main() {
  copyIsDesignVerbatim();
  fiveStepsBothRoles();
  rolesStaySplit();
  storageOncePerBrowser();
  uiWiring();
  console.log("OK  ops first-visit walkthrough (5 Design steps, both roles)");
}

main();
