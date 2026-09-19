import { NextResponse } from "next/server";
import { loadIngestRefresh } from "@/lib/incident/refresh-ingest";

export const dynamic = "force-dynamic";

/** Lightweight FIRMS + wind refresh for Ops polling (skips agents / LLM). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = await loadIngestRefresh(url.searchParams.get("region"));
  return NextResponse.json(payload);
}
