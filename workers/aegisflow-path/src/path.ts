export const PROD_BASE_PATH = "/aegisflow";

/** OpenNext Worker hostname. Service-bind here so SSR never re-enters the path Worker. */
export const DEFAULT_AEGISFLOW_ORIGIN = "https://aegisflow.jaime-8a8.workers.dev";

/** Dead Pages preview + workers.dev — rewrite these hosts onto the public origin. */
export function isPreviewHost(hostname: string): boolean {
  return (
    hostname === "aegisflow.pages.dev" ||
    (hostname.startsWith("aegisflow.") && hostname.endsWith(".workers.dev"))
  );
}

/**
 * Build the URL passed to the AEGISFLOW service binding.
 * Must use the OpenNext Worker origin, not the inbound Host. OpenNext SSR
 * (global_fetch_strictly_public) fetches request.url; if that host routes
 * back to this path Worker, Cloudflare returns Error 1019 (self-recursion).
 */
export function internalOriginUrl(
  requestUrl: URL,
  internalOrigin: string = DEFAULT_AEGISFLOW_ORIGIN,
): URL {
  const dest = new URL(internalOrigin);
  dest.pathname = originPath(requestUrl.pathname);
  dest.search = requestUrl.search;
  dest.hash = requestUrl.hash;
  return dest;
}

export function applyForwardedHeaders(
  headers: Headers,
  requestUrl: URL,
  connectingIp?: string | null,
): Headers {
  headers.set("X-Forwarded-Host", requestUrl.host);
  headers.set("X-Forwarded-Proto", requestUrl.protocol.replace(":", "") || "https");
  if (connectingIp) {
    headers.set("X-Forwarded-For", connectingIp);
  }
  return headers;
}

export function isAppPath(pathname: string, basePath = PROD_BASE_PATH): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

/** OpenNext + Next.js basePath: keep `/aegisflow` on the origin request. */
export function originPath(pathname: string): string {
  return pathname;
}

export function rewriteLocation(
  location: string,
  requestUrl: URL,
  basePath = PROD_BASE_PATH,
): string {
  let parsed: URL;
  try {
    parsed = new URL(location, requestUrl);
  } catch {
    return location;
  }

  const isLegacyPreview = isPreviewHost(parsed.hostname);
  const isPublicHost = parsed.hostname === requestUrl.hostname;

  if (!isLegacyPreview && !isPublicHost && parsed.origin !== requestUrl.origin) {
    return location;
  }

  let path = parsed.pathname;
  if (isLegacyPreview && !isAppPath(path, basePath)) {
    path = path === "/" ? basePath : `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
  } else if (!isAppPath(path, basePath) && path !== "/") {
    path = `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
  } else if (path === "/") {
    path = `${basePath}/`;
  }

  const publicOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
  return `${publicOrigin}${path}${parsed.search}${parsed.hash}`;
}
