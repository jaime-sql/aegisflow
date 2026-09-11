"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import type { IncidentEvent } from "@/lib/schema";
import type { OpsSession } from "@/lib/auth/session";

function statusColor(status: string) {
  if (status === "ok") return "bg-[#3dd68c]";
  if (status === "degraded") return "bg-[#f5c542]";
  return "bg-[#ff5d73]";
}

export function TopBar({
  incident,
  session,
}: {
  incident: IncidentEvent;
  session: OpsSession;
}) {
  const overall = incident.feedHealth.overall;
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[#1c2533] bg-[#0b0f14] px-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#ff6b2c] font-mono text-xs font-bold text-black">
          AF
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-wide">AegisFlow</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b98a8]">
            Ops · IEEE #5395
          </div>
        </div>
      </div>

      <div className="hidden h-7 w-px bg-[#1c2533] sm:block" />

      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{incident.name}</div>
        <div className="font-mono text-[10px] text-[#5ce1e6]">
          {incident.eventId} · v{incident.schemaVersion}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-[#1c2533] bg-[#121821] px-3 py-1 md:flex">
          <span className={`h-2 w-2 rounded-full ${statusColor(overall)}`} />
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#8b98a8]">
            Feed {overall}
          </span>
          <div className="ml-1 flex gap-1">
            {incident.feedHealth.feeds.map((f) => (
              <span
                key={f.id}
                title={`${f.label}: ${f.status}`}
                className={`h-1.5 w-1.5 rounded-full ${statusColor(f.status)}`}
              />
            ))}
          </div>
        </div>

        <span
          className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${
            session.role === "manager"
              ? "border-[#ff6b2c]/40 text-[#ff6b2c]"
              : "border-[#8b98a8]/40 text-[#8b98a8]"
          }`}
        >
          {session.role}
        </span>

        {session.clerkEnabled ? (
          <UserButton />
        ) : (
          <div
            title={session.displayName}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1c2533] bg-[#121821] text-[10px] font-semibold"
          >
            {session.displayName
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)}
          </div>
        )}

        <Link
          href="/fabric"
          className="hidden font-mono text-[10px] uppercase tracking-wider text-[#8b98a8] hover:text-[#5ce1e6] sm:inline"
        >
          Fabric twin
        </Link>
      </div>
    </header>
  );
}
