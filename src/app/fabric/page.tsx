import Link from "next/link";
import { loadFixtureIncident } from "@/lib/fixtures/aegisfire-01";
import { collectEventIds } from "@/lib/schema";

export const dynamic = "force-dynamic";

export default function FabricStubPage() {
  const incident = loadFixtureIncident();
  const ids = [...new Set(collectEventIds(incident))].sort();

  return (
    <div className="min-h-screen bg-[#07090d] px-6 py-10 text-[#e8eef6]">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b98a8]">
        Fabric twin · stub
      </p>
      <h1 className="mt-2 text-2xl font-semibold">No live Fabric map in Stage 1</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#8b98a8]">
        Architecture locks a single Ops dashboard. This page exists so a future Fabric
        digital twin can join on the same <code className="text-[#5ce1e6]">eventId</code>{" "}
        / <code className="text-[#5ce1e6]">schemaVersion</code> values. There is no
        second Replit map and no live RF mesh.
      </p>
      <p className="mt-4 font-mono text-sm text-[#5ce1e6]">
        {incident.incidentId} · {incident.eventId} · schemaVersion {incident.schemaVersion}
      </p>
      <Link href="/" className="mt-6 inline-block text-sm text-[#ff6b2c] hover:underline">
        ← Back to Ops
      </Link>
      <h2 className="mt-10 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8b98a8]">
        Shared event IDs
      </h2>
      <ul className="mt-3 columns-1 gap-x-8 font-mono text-[11px] text-[#c9d4e0] md:columns-2">
        {ids.map((id) => (
          <li key={id} className="break-inside-avoid py-0.5">
            {id}
          </li>
        ))}
      </ul>
    </div>
  );
}
