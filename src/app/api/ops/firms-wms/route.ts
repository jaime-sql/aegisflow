import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Server-side FIRMS WMS proxy so MAP_KEY never reaches the browser.
 * Leaflet tileLayer.wms appends standard GetMap query params.
 * Docs: https://firms.modaps.eosdis.nasa.gov/mapserver/wms-info/
 */
export async function GET(request: Request) {
  const key = process.env.FIRMS_MAP_KEY?.trim();
  if (!key) {
    return new NextResponse(null, { status: 204 });
  }

  const inbound = new URL(request.url);
  const params = new URLSearchParams(inbound.search);
  if (!params.get("REQUEST")) params.set("REQUEST", "GetMap");
  if (!params.get("SERVICE")) params.set("SERVICE", "WMS");
  if (!params.get("VERSION")) params.set("VERSION", "1.1.1");

  const firmsUrl =
    `https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/${encodeURIComponent(key)}/?` +
    params.toString();

  try {
    const res = await fetch(firmsUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return new NextResponse(null, { status: res.status === 404 ? 404 : 502 });
    }
    const buf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/png";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=120",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
