export function SimBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-[#3DB9FF]/40 bg-[#0B1220] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#3DB9FF]">
      {label}
      <span className="rounded-sm bg-[#3DB9FF]/20 px-1 text-[#E8EEF9]">SIM</span>
    </span>
  );
}
