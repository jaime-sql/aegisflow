import { canDispatch, type OpsRole } from "@/lib/auth/roles";

/** localStorage — first visit once per browser. Skip / Don't show again persist. */
export const OPS_WALKTHROUGH_STORAGE_KEY = "aegisflow.opsWalkthrough.v1";
export const OPS_WALKTHROUGH_STORAGE_VALUE = "dismissed";

export const OPS_WALKTHROUGH_CHROME = {
  skip: "Skip",
  dontShowAgain: "Don't show again",
  next: "Next",
  done: "Done",
  /** TopBar replay control. Same five steps; not a sixth coach mark. */
  replay: "Tour",
} as const;

export const OPS_WALKTHROUGH_TARGETS = [
  "region",
  "map-layers",
  "agents-lineage",
  "dispatch",
  "brief-aloud",
] as const;

export type OpsWalkthroughTarget = (typeof OPS_WALKTHROUGH_TARGETS)[number];

/** Design copy — do not invent extra steps or paraphrase these strings. */
export const OPS_WALKTHROUGH_COPY = {
  region: {
    title: "Region",
    body: "Switch El Salvador ↔ Cascade for the demo scenario.",
  },
  "map-layers": {
    title: "Map layers",
    body: "Toggle Hotspots / Wind / Agents; feed age stays honest (LIVE vs DEMO FIXTURE / Wind · fallback).",
  },
  "agents-lineage": {
    title: "Agents + lineage",
    body: "Open a chip, then View lineage — same `eventId`s as the map.",
  },
  dispatch: {
    title: "Dispatch",
    managerBody: "Ack / Assign here.",
    viewerBody: "Actions locked — you're viewing only.",
  },
  "brief-aloud": {
    title: "Brief aloud",
    body: "Exec Summary Brief aloud.",
  },
} as const;

export type OpsWalkthroughStep = {
  id: OpsWalkthroughTarget;
  title: string;
  body: string;
  target: OpsWalkthroughTarget;
};

/**
 * First-visit Ops coach marks. Five Design steps for Manager and Viewer.
 * Dispatch body is role-specific; Brief aloud is listen-only for both.
 */
export function opsWalkthroughSteps(role: OpsRole): OpsWalkthroughStep[] {
  return [
    {
      id: "region",
      title: OPS_WALKTHROUGH_COPY.region.title,
      body: OPS_WALKTHROUGH_COPY.region.body,
      target: "region",
    },
    {
      id: "map-layers",
      title: OPS_WALKTHROUGH_COPY["map-layers"].title,
      body: OPS_WALKTHROUGH_COPY["map-layers"].body,
      target: "map-layers",
    },
    {
      id: "agents-lineage",
      title: OPS_WALKTHROUGH_COPY["agents-lineage"].title,
      body: OPS_WALKTHROUGH_COPY["agents-lineage"].body,
      target: "agents-lineage",
    },
    {
      id: "dispatch",
      title: OPS_WALKTHROUGH_COPY.dispatch.title,
      body: canDispatch(role)
        ? OPS_WALKTHROUGH_COPY.dispatch.managerBody
        : OPS_WALKTHROUGH_COPY.dispatch.viewerBody,
      target: "dispatch",
    },
    {
      id: "brief-aloud",
      title: OPS_WALKTHROUGH_COPY["brief-aloud"].title,
      body: OPS_WALKTHROUGH_COPY["brief-aloud"].body,
      target: "brief-aloud",
    },
  ];
}

export type WalkthroughStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function browserStore(): WalkthroughStore | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Missing / locked storage must not pin a blocking overlay on Ops.
 * SSR and storage errors → treated as dismissed.
 */
export function isOpsWalkthroughDismissed(
  store?: WalkthroughStore | null,
): boolean {
  const s = store === undefined ? browserStore() : store;
  if (!s) return true;
  try {
    return s.getItem(OPS_WALKTHROUGH_STORAGE_KEY) === OPS_WALKTHROUGH_STORAGE_VALUE;
  } catch {
    return true;
  }
}

/** Persist dismissal. Throws never — Ops stays usable if storage is blocked. */
export function dismissOpsWalkthrough(store?: WalkthroughStore | null): void {
  const s = store === undefined ? browserStore() : store;
  if (!s) return;
  try {
    s.setItem(OPS_WALKTHROUGH_STORAGE_KEY, OPS_WALKTHROUGH_STORAGE_VALUE);
  } catch {
    // ignore
  }
}

/**
 * Drop the seen flag so the same overlay can open again.
 * Throws never — a blocked store stays treated as dismissed.
 */
export function clearOpsWalkthroughDismissal(
  store?: WalkthroughStore | null,
): void {
  const s = store === undefined ? browserStore() : store;
  if (!s) return;
  try {
    s.removeItem(OPS_WALKTHROUGH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const OPS_TOUR_ATTR = "data-ops-tour";

export function opsTourSelector(target: OpsWalkthroughTarget): string {
  return `[${OPS_TOUR_ATTR}="${target}"]`;
}
