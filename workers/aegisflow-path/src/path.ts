export const PROD_BASE_PATH = "/aegisflow";

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
  pagesOrigin: string,
  basePath = PROD_BASE_PATH,
): string {
  let parsed: URL;
  try {
    parsed = new URL(location, requestUrl);
  } catch {
    return location;
  }

  const pages = new URL(pagesOrigin);
  const isPagesHost = parsed.hostname === pages.hostname;
  const isPublicHost = parsed.hostname === requestUrl.hostname;

  if (!isPagesHost && !isPublicHost && parsed.origin !== requestUrl.origin) {
    return location;
  }

  let path = parsed.pathname;
  if (isPagesHost && !isAppPath(path, basePath)) {
    path = path === "/" ? basePath : `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
  } else if (!isAppPath(path, basePath) && path !== "/") {
    path = `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
  } else if (path === "/") {
    path = `${basePath}/`;
  }

  const publicOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
  return `${publicOrigin}${path}${parsed.search}${parsed.hash}`;
}
