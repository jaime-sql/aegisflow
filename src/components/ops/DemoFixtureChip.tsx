import { FIRMS_DEMO_CHIP_LABEL } from "@/lib/ui/firms-demo";

/** Amber map chip shown only while FIRMS is plotting the demo fixture. */
export function DemoFixtureChip() {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded border border-[#FFB020] bg-[#0B1220] px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-[#FFB020]">
      {FIRMS_DEMO_CHIP_LABEL}
    </span>
  );
}
