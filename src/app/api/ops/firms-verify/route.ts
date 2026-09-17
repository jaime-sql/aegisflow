import { NextResponse } from "next/server";
import { verifyFirmsForRegion } from "@/lib/ingest/firms";

export const dynamic = "force-dynamic";

/** Diagnostic only: row count / error. Never returns hotspot coordinates. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await verifyFirmsForRegion(url.searchParams.get("region"));
  return NextResponse.json(result);
}
