import { FIRMS_QUIET_CHIP_LABEL } from "@/lib/ui/firms-demo";

/** Cyan map chip when live FIRMS returned zero detections for the active bbox. */
export function QuietBboxChip() {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded border border-[#3DB9FF]/55 bg-[#0B1220] px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-[#3DB9FF]">
      {FIRMS_QUIET_CHIP_LABEL}
    </span>
  );
}
