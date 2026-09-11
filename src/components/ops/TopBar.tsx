"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { IncidentEvent } from "@/lib/schema";
import type { OpsSession } from "@/lib/auth/session";
import { feedDisplay, feedDotClass } from "@/lib/ui/status";
import { SimBadge } from "./SimBadge";

const ClerkUserButton = dynamic(
  () => import("./ClerkUserButton").then((m) => m.ClerkUserButton),
  { ssr: false },
);

const PRIMARY_FEEDS = ["firms", "wind", "crowd"] as const;

export function TopBar({
  incident,
  session,
}: {
  incident: IncidentEvent;
  session: OpsSession;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#1E2A40] bg-[#0B1220] px-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#FF4D2E] font-mono text-[11px] font-bold text-black">
          AF
        </span>
        <span className="text-sm font-semibold tracking-wide text-[#E8EEF9]">AegisFlow</span>
      </div>

      <div className="hidden h-6 w-px bg-[#1E2A40] sm:block" />

      <label className="flex min-w-0 items-center gap-1.5">
        <span className="sr-only">Incident</span>
        <select
          className="max-w-[220px] truncate rounded border border-[#1E2A40] bg-[#121A2B] px-2 py-1 text-sm text-[#E8EEF9]"
          defaultValue={incident.incidentId}
          aria-label="Incident"
        >
          <option value={incident.incidentId}>{incident.incidentId}</option>
        </select>
      </label>

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div className="hidden items-center gap-2 md:flex">
          {PRIMARY_FEEDS.map((id) => {
            const feed = incident.feedHealth.feeds.find((f) => f.id === id);
            if (!feed) return null;
            return (
              <span
                key={feed.id}
                title={feed.detail}
                className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8]"
              >
                {feed.label.replace("NASA ", "").replace(" / IoT", "")}
                <span className={`h-1.5 w-1.5 rounded-full ${feedDotClass(feed.status)}`} />
                <span className="text-[#E8EEF9]">{feedDisplay(feed.status)}</span>
              </span>
            );
          })}
          <SimBadge label="RF" />
          <SimBadge label="Edge" />
        </div>

        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
            session.role === "manager"
              ? "border-[#FF4D2E]/45 text-[#FF4D2E]"
              : "border-[#8B9BB8]/45 text-[#8B9BB8]"
          }`}
        >
          {session.role === "manager" ? "Manager" : "Viewer"} ▾
        </span>

        {session.clerkEnabled ? (
          <ClerkUserButton />
        ) : (
          <div
            title={session.displayName}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[#1E2A40] bg-[#121A2B] text-[10px] font-semibold"
          >
            {session.displayName
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)}
          </div>
        )}

        {session.role === "manager" && (
          <Link
            href="/fabric"
            className="hidden font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8] hover:text-[#3DB9FF] sm:inline"
          >
            Fabric twin
          </Link>
        )}
      </div>
    </header>
  );
}
