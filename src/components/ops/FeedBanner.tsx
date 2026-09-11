import type { FeedHealth } from "@/lib/schema";
import { feedDisplay, feedTextClass } from "@/lib/ui/status";

export function FeedBanner({ health }: { health: FeedHealth }) {
  const bad = health.feeds.filter((f) => f.status !== "ok");
  if (bad.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-3 right-3 top-12 z-[500] rounded-md border border-[#FFB020]/50 bg-[#121A2B]/95 px-3 py-2 text-[12px] text-[#E8EEF9] shadow-lg">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[#FFB020]">
        Feed banner
      </span>
      <ul className="mt-1 space-y-0.5">
        {bad.map((f) => (
          <li key={f.id}>
            <span className={feedTextClass(f.status)}>{feedDisplay(f.status)}</span>
            {" · "}
            {f.label}: {f.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
