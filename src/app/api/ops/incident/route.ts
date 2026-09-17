import { NextResponse } from "next/server";
import { loadOpsIncident } from "@/lib/incident/load";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const incident = await loadOpsIncident(url.searchParams.get("region"));
  return NextResponse.json(incident);
}
