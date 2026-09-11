"use client";

import { useEffect, useMemo, useState } from "react";
import type { TimelineItem } from "@/lib/schema";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function tPlus(fromIso: string, atIso: string) {
  const ms = new Date(atIso).getTime() - new Date(fromIso).getTime();
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `T+${pad(m)}:${pad(s)}`;
}

export function TimelineScrubber({
  items,
  startedAt,
}: {
  items: TimelineItem[];
  startedAt: string;
}) {
  const ordered = useMemo(
    () => [...items].sort((a, b) => a.at.localeCompare(b.at)),
    [items],
  );
  const [index, setIndex] = useState(ordered.length - 1);
  const [playing, setPlaying] = useState(false);
  const current = ordered[index] ?? ordered[ordered.length - 1];

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % ordered.length);
    }, 900);
    return () => window.clearInterval(id);
  }, [playing, ordered.length]);

  const pct = ordered.length <= 1 ? 100 : (index / (ordered.length - 1)) * 100;

  return (
    <section className="px-4 py-3">
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8B9BB8]">
        Stream / timeline
      </h2>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="rounded border border-[#1E2A40] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#E8EEF9]"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <div className="relative h-1.5 flex-1 rounded-full bg-[#1E2A40]">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[#3DB9FF]" style={{ width: `${pct}%` }} />
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF4D2E]"
            style={{ left: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-[11px] text-[#3DB9FF]">
          {current ? tPlus(startedAt, current.at) : "T+00:00"}
        </span>
      </div>
      {current && (
        <div className="mt-2 text-[11px]">
          <span className="text-[#E8EEF9]">{current.label}</span>
          {current.kind === "sim" && (
            <span className="ml-2 rounded border border-[#3DB9FF]/40 px-1 font-mono text-[9px] text-[#3DB9FF]">
              SIM
            </span>
          )}
          {current.kind === "crowd" && (
            <span className="ml-2 rounded border border-[#FFB020]/40 px-1 font-mono text-[9px] text-[#FFB020]">
              Scrubbed
            </span>
          )}
          {current.detail ? (
            <p className="mt-0.5 text-[#8B9BB8]">{current.detail}</p>
          ) : null}
          <p className="font-mono text-[10px] text-[#3DB9FF]">{current.eventId}</p>
        </div>
      )}
    </section>
  );
}
