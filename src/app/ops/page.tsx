import { OpsShell } from "@/components/ops/OpsShell";
import { RegionPicker } from "@/components/ops/RegionPicker";
import { getOpsSession } from "@/lib/auth/session";
import { loadOpsIncident } from "@/lib/incident/load";

export const dynamic = "force-dynamic";

export default async function OpsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; region?: string }>;
}) {
  const params = await searchParams;
  const [incident, session] = await Promise.all([
    loadOpsIncident(params.region),
    getOpsSession(params.role),
  ]);

  return (
    <OpsShell
      incident={incident}
      session={session}
      regionPicker={<RegionPicker regionId={incident.region.id} />}
    />
  );
}
