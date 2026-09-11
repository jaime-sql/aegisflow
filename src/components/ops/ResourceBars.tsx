import type { ResourceBar } from "@/lib/schema";

export function ResourceBars({ resources }: { resources: ResourceBar[] }) {
  return (
    <section className="border-b border-[#1E2A40] px-4 py-3">
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8B9BB8]">
        Resources
      </h2>
      {resources.map((r) => {
        const pct = r.available === 0 ? 0 : Math.round((r.allocated / r.available) * 100);
        return (
          <div key={r.id} className="mb-2">
            <div className="mb-1 flex justify-between text-[11px]">
              <span>{r.label}</span>
              <span className="font-mono text-[#8B9BB8]">
                {r.allocated}/{r.available}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#1E2A40]">
              <div
                className="h-full rounded-full bg-[#FF4D2E]"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
