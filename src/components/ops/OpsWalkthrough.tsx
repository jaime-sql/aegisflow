"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OpsRole } from "@/lib/auth/roles";
import {
  OPS_WALKTHROUGH_CHROME,
  dismissOpsWalkthrough,
  isOpsWalkthroughDismissed,
  opsTourSelector,
  opsWalkthroughSteps,
  type OpsWalkthroughTarget,
} from "@/lib/ui/ops-walkthrough";

const HOLE_PAD = 6;
const CARD_GAP = 12;
const CARD_WIDTH = 320;
const TARGET_WAIT_MS = 8000;

const PLACEMENT: Record<OpsWalkthroughTarget, "below" | "above" | "left"> = {
  region: "below",
  "map-layers": "above",
  "agents-lineage": "left",
  dispatch: "left",
  "brief-aloud": "left",
};

type Hole = { top: number; left: number; width: number; height: number };

function clampCard(
  hole: Hole,
  size: { width: number; height: number },
  side: "below" | "above" | "left",
): { top: number; left: number } {
  let top = hole.top;
  let left = hole.left;
  if (side === "below") {
    top = hole.top + hole.height + CARD_GAP;
    left = hole.left;
  } else if (side === "above") {
    top = hole.top - size.height - CARD_GAP;
    left = hole.left;
  } else {
    top = hole.top;
    left = hole.left - size.width - CARD_GAP;
  }
  const pad = 8;
  const maxTop = Math.max(pad, window.innerHeight - size.height - pad);
  const maxLeft = Math.max(pad, window.innerWidth - size.width - pad);
  return {
    top: Math.min(Math.max(top, pad), maxTop),
    left: Math.min(Math.max(left, pad), maxLeft),
  };
}

/**
 * First-visit Ops coach marks. Overlay unmounts after Skip / Don't show again /
 * Done so Ops is never blocked once dismissed.
 */
export function OpsWalkthrough({ role }: { role: OpsRole }) {
  const steps = useMemo(() => opsWalkthroughSteps(role), [role]);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hole, setHole] = useState<Hole | null>(null);
  const [cardSize, setCardSize] = useState({ width: CARD_WIDTH, height: 160 });
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[stepIndex] ?? steps[0];

  const closeTour = useCallback(() => {
    dismissOpsWalkthrough();
    setOpen(false);
    setHole(null);
  }, []);

  useEffect(() => {
    if (!isOpsWalkthroughDismissed()) setOpen(true);
  }, []);

  useEffect(() => {
    const current = steps[stepIndex];
    if (!open || !current) return;
    let cancelled = false;
    let interval = 0;
    let timeout = 0;
    const find = () => document.querySelector(opsTourSelector(current.target));

    const attach = (el: Element) => {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const read = () => {
        if (cancelled) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) return;
        setHole({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      };
      read();
      window.addEventListener("resize", read);
      window.addEventListener("scroll", read, true);
      const ro = new ResizeObserver(read);
      ro.observe(el);
      return () => {
        window.removeEventListener("resize", read);
        window.removeEventListener("scroll", read, true);
        ro.disconnect();
      };
    };

    let detach: (() => void) | undefined;
    const el = find();
    if (el) {
      detach = attach(el);
    } else {
      interval = window.setInterval(() => {
        const found = find();
        if (!found || cancelled) return;
        window.clearInterval(interval);
        detach = attach(found);
      }, 80);
      timeout = window.setTimeout(() => {
        window.clearInterval(interval);
        if (cancelled || find()) return;
        setStepIndex((i) => {
          if (i + 1 < steps.length) return i + 1;
          closeTour();
          return i;
        });
      }, TARGET_WAIT_MS);
    }

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      detach?.();
    };
  }, [closeTour, open, stepIndex, steps]);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width && rect.height) {
      setCardSize({ width: rect.width, height: rect.height });
    }
  }, [stepIndex, hole, step?.body]);

  if (!open || !step || typeof document === "undefined") return null;

  const last = stepIndex >= steps.length - 1;
  const cardPos = hole
    ? clampCard(
        {
          top: hole.top - HOLE_PAD,
          left: hole.left - HOLE_PAD,
          width: hole.width + HOLE_PAD * 2,
          height: hole.height + HOLE_PAD * 2,
        },
        cardSize,
        PLACEMENT[step.target],
      )
    : { top: 24, left: 24 };

  return createPortal(
    <div
      className="fixed inset-0 z-[900] overflow-hidden"
      data-ops-walkthrough="true"
      aria-live="polite"
    >
      {hole ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-[#3DB9FF]"
          style={{
            top: hole.top - HOLE_PAD,
            left: hole.left - HOLE_PAD,
            width: hole.width + HOLE_PAD * 2,
            height: hole.height + HOLE_PAD * 2,
            boxShadow: "0 0 0 9999px rgba(11, 18, 32, 0.72)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#0B1220]/70" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ops-tour-title"
        className="absolute z-[901] w-[min(320px,calc(100vw-16px))] rounded-md border border-[#1E2A40] bg-[#121A2B] p-3 text-[#E8EEF9] shadow-2xl"
        style={{ top: cardPos.top, left: cardPos.left }}
      >
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2
            id="ops-tour-title"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#3DB9FF]"
          >
            {step.title}
          </h2>
          <span className="font-mono text-[10px] text-[#8B9BB8]">
            {stepIndex + 1}/{steps.length}
          </span>
        </div>
        <p className="text-[12px] leading-relaxed text-[#E8EEF9]">{step.body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={closeTour}
            className="font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8] hover:text-[#E8EEF9]"
          >
            {OPS_WALKTHROUGH_CHROME.dontShowAgain}
          </button>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={closeTour}
              className="rounded border border-[#1E2A40] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8] hover:border-[#8B9BB8]/50"
            >
              {OPS_WALKTHROUGH_CHROME.skip}
            </button>
            <button
              type="button"
              onClick={() => {
                if (last) {
                  closeTour();
                  return;
                }
                setHole(null);
                setStepIndex((i) => i + 1);
              }}
              className="rounded border border-[#3DB9FF]/50 bg-[#0B1220] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#3DB9FF] hover:bg-[#3DB9FF]/10"
            >
              {last ? OPS_WALKTHROUGH_CHROME.done : OPS_WALKTHROUGH_CHROME.next}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
