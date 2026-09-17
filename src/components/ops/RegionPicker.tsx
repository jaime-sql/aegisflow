import { withBasePath } from "@/lib/base-path";
import { OPS_REGION_OPTIONS, resolveRegionId } from "@/lib/regions";

/**
 * Server-rendered GET picker. Native `onchange` is in the HTML so OpenNext
 * Worker Ops remaps even when the client bundle does not attach React
 * handlers. The control stays clickable (Design bar: never greyed on live Ops).
 */
export function RegionPicker({ regionId }: { regionId: string }) {
  const selected = resolveRegionId(regionId);
  const action = withBasePath("/ops");
  const options = OPS_REGION_OPTIONS.map((option) => {
    const isSelected = option.id === selected ? " selected" : "";
    return `<option value="${option.id}"${isSelected}>${option.label}</option>`;
  }).join("");

  return (
    <div
      className="flex min-w-0 items-center gap-1.5"
      dangerouslySetInnerHTML={{
        __html: `<form class="flex min-w-0 items-center gap-1.5" action="${action}" method="get"><label class="flex min-w-0 items-center gap-1.5"><span class="sr-only">Region</span><select name="region" aria-label="Region" class="max-w-[260px] cursor-pointer truncate rounded border border-[#1E2A40] bg-[#121A2B] px-2 py-1 text-sm text-[#E8EEF9]" onchange="this.form.submit()">${options}</select></label><button type="submit" class="sr-only">Load region</button></form>`,
      }}
    />
  );
}
