export const PROD_BASE_PATH = "/aegisflow";

/** Dead Pages preview + workers.dev — rewrite these hosts onto the public origin. */
export function isPreviewHost(hostname: string): boolean {
  return (
    hostname === "aegisflow.pages.dev" ||
    (hostname.startsWith("aegisflow.") && hostname.endsWith(".workers.dev"))
  );
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
