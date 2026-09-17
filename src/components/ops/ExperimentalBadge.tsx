export function ExperimentalBadge({
  label = "WeatherNext",
}: {
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-[#FFB020]/50 bg-[#0B1220] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#FFB020]">
      {label}
      <span className="rounded-sm bg-[#FFB020]/20 px-1 text-[#E8EEF9]">
        Experimental
      </span>
    </span>
  );
}
