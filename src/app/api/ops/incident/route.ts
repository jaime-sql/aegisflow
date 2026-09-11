import { NextResponse } from "next/server";
import { loadOpsIncident } from "@/lib/incident/load";

export const dynamic = "force-dynamic";

export async function GET() {
  const incident = await loadOpsIncident();
  return NextResponse.json(incident);
}
