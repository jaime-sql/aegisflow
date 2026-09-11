import type { IncidentEvent } from "@/lib/schema";

export function ExecSummaryCard({
  incident,
  onViewLineage,
}: {
  incident: IncidentEvent;
  onViewLineage: () => void;
}) {
  const sources = ["FIRMS", "Wind", "RAG"];
  return (
    <section className="border-b border-[#1E2A40] px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8B9BB8]">
          Exec summary
        </h2>
        <span className="truncate font-mono text-[10px] text-[#3DB9FF]">{incident.eventId}</span>
      </div>
      <p className="text-[13px] leading-relaxed text-[#E8EEF9]">{incident.executiveSummary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {sources.map((s) => (
          <span
            key={s}
            className="rounded-full border border-[#1E2A40] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#8B9BB8]"
          >
            {s}
          </span>
        ))}
        <button
          type="button"
          onClick={onViewLineage}
          className="ml-auto font-mono text-[10px] uppercase tracking-wider text-[#3DB9FF] hover:underline"
        >
          View lineage
        </button>
      </div>
    </section>
  );
}
