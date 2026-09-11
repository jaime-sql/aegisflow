import Link from "next/link";
import { loadFixtureIncident } from "@/lib/fixtures/aegisfire-01";
import { collectEventIds } from "@/lib/schema";
import { agentShortName } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

export default function FabricStubPage() {
  const incident = loadFixtureIncident();
  const ids = [...new Set(collectEventIds(incident))].sort();

  return (
    <div className="min-h-screen bg-[#0B1220] px-6 py-10 text-[#E8EEF9]">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8B9BB8]">
        Fabric twin · analytics · not a live map
      </p>
      <h1 className="mt-2 text-2xl font-semibold">AegisFire-01 executive twin</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#8B9BB8]">
        Same <code className="text-[#3DB9FF]">eventId</code> /{" "}
        <code className="text-[#3DB9FF]">schemaVersion</code> as Ops. No interactive
        hazard map and no Replit duplicate.
      </p>
      <p className="mt-4 font-mono text-sm text-[#3DB9FF]">
        {incident.incidentId} · {incident.eventId} · v{incident.schemaVersion}
      </p>
      <Link href="/ops" className="mt-6 inline-block text-sm text-[#FF4D2E] hover:underline">
        ← Back to Ops
      </Link>

      <section className="mt-10 grid gap-3 md:grid-cols-2">
        <article className="rounded-lg border border-[#1E2A40] bg-[#121A2B] p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8]">
            Exec summary
          </h2>
          <p className="mt-2 text-sm leading-relaxed">{incident.executiveSummary}</p>
          <p className="mt-2 font-mono text-[11px] text-[#3DB9FF]">{incident.eventId}</p>
        </article>
        {incident.agents.map((agent) => (
          <article
            key={agent.eventId}
            className="rounded-lg border border-[#1E2A40] bg-[#121A2B] p-4"
          >
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8]">
              {agentShortName(agent.agentId)}
            </h2>
            <p className="mt-1 font-mono text-[11px] text-[#3DB9FF]">{agent.eventId}</p>
            <p className="mt-1 text-xs text-[#8B9BB8]">conf {agent.confidence.toFixed(2)}</p>
            <p className="mt-2 text-sm leading-relaxed">{agent.summary}</p>
          </article>
        ))}
      </section>

      <h2 className="mt-10 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8B9BB8]">
        Lineage table
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[12px]">
          <thead className="font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8]">
            <tr>
              <th className="border-b border-[#1E2A40] py-2 pr-3">Agent eventId</th>
              <th className="border-b border-[#1E2A40] py-2 pr-3">Source eventId</th>
              <th className="border-b border-[#1E2A40] py-2">Kind / label</th>
            </tr>
          </thead>
          <tbody>
            {incident.agents.flatMap((agent) =>
              agent.lineage.map((src) => (
                <tr key={`${agent.eventId}-${src.eventId}`}>
                  <td className="border-b border-[#1E2A40] py-1.5 pr-3 font-mono text-[11px] text-[#3DB9FF]">
                    {agent.eventId}
                  </td>
                  <td className="border-b border-[#1E2A40] py-1.5 pr-3 font-mono text-[11px]">
                    {src.eventId}
                  </td>
                  <td className="border-b border-[#1E2A40] py-1.5 text-[#8B9BB8]">
                    {src.kind} · {src.label}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8B9BB8]">
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
