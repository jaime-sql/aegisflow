/**
 * Resolve Next.js `basePath` / `assetPrefix` from the environment.
 *
 * - Local / `next dev`: `""` (app lives at `/`)
 * - Prod / Cloudflare: `/aegisflow`
 * `BASE_PATH` always wins when set (also reads `NEXT_PUBLIC_BASE_PATH` on the client).
 *
 * Next.js `Link`, `redirect()`, and `next/navigation` already prefix `basePath`.
 * Use `withBasePath()` for raw `<a>`, `fetch()`, Leaflet URLs, Clerk env paths,
 * and human-readable path copy — never pass it into `Link href` or you will
 * double-prefix (`/aegisflow/aegisflow/ops`).
 *
 * Client bundles: Next.js inlines `process.env.NEXT_PUBLIC_*` member expressions
 * at build time. It does **not** turn `process.env` into a real object, so
 * `const env = process.env; env.NEXT_PUBLIC_BASE_PATH` is `undefined` in the
 * browser. Always read those keys as `process.env.NEXT_PUBLIC_BASE_PATH`.
 * As a second line of defense, `withBasePath()` infers `/aegisflow` from the
 * current pathname when Ops is already under that prefix.
 */
export const PROD_BASE_PATH = "/aegisflow";

/**
 * Env keys Next.js can inline in the client bundle.
 * Direct `process.env.X` member access is required — do not pass `process.env`
 * through a variable and then read `env.X`.
 */
export function inlineablePathEnv(): Record<string, string | undefined> {
  return {
    BASE_PATH: process.env.BASE_PATH,
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH,
    CLOUDFLARE_PROD: process.env.CLOUDFLARE_PROD,
    CF_PAGES: process.env.CF_PAGES,
  };
}

/** True when the current path is already under the prod Next.js basePath. */
export function inferBasePathFromPathname(pathname: string): string {
  if (pathname === PROD_BASE_PATH || pathname.startsWith(`${PROD_BASE_PATH}/`)) {
    return PROD_BASE_PATH;
  }
  return "";
}

export function resolveBasePath(
  env: Record<string, string | undefined> = inlineablePathEnv(),
): string {
  const raw = (env.BASE_PATH ?? env.NEXT_PUBLIC_BASE_PATH)?.trim() ?? "";
  if (raw && raw !== "/") {
    const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
    return prefixed.replace(/\/+$/, "");
  }
  if (env.CLOUDFLARE_PROD === "true" || env.CF_PAGES === "1" || env.CF_PAGES === "true") {
    return PROD_BASE_PATH;
  }
  return "";
}

/** Prefix a root-relative path with the active `basePath`. */
export function withBasePath(
  path: string,
  env: Record<string, string | undefined> = inlineablePathEnv(),
  locationPathname?: string,
): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const fromEnv = resolveBasePath(env);
  const pathname =
    locationPathname ??
    (typeof window !== "undefined" ? window.location.pathname : undefined);
  const fromLocation = pathname ? inferBasePathFromPathname(pathname) : "";
  const base = fromEnv || fromLocation;
  return `${base}${normalized}`;
}

/**
 * Absolute URL for an in-app path (client `fetch`, hard navigation).
 * Infers `/aegisflow` from `currentHref` when env inlining is missing so
 * Worker Ops never hits bare `/api/...` (OpenNext 404) or apex `/`.
 */
export function absoluteAppUrl(path: string, currentHref?: string): string {
  const href =
    currentHref ??
    (typeof window !== "undefined" ? window.location.href : undefined);
  const pathname = href ? new URL(href, "http://localhost").pathname : undefined;
  const prefixed = withBasePath(path, inlineablePathEnv(), pathname);
  if (href) {
    return new URL(prefixed, href).href;
  }
  return prefixed;
}

/** GET `/api/ops/incident?region=` under the active basePath. */
export function opsIncidentUrl(regionId: string, currentHref?: string): string {
  return absoluteAppUrl(
    `/api/ops/incident?region=${encodeURIComponent(regionId)}`,
    currentHref,
  );
}

/**
 * Same-origin Ops URL with `?region=` (and other query params preserved).
 * Pathname is taken from the current page so we never navigate to `/ops`
 * without `/aegisflow` or to the cortexmatter.com apex.
 */
export function opsRegionHref(regionId: string, currentHref?: string): string {
  const href =
    currentHref ??
    (typeof window !== "undefined" ? window.location.href : undefined);
  if (href) {
    const url = new URL(href, "http://localhost");
    url.searchParams.set("region", regionId);
    return `${url.pathname}${url.search}`;
  }
  return withBasePath(`/ops?region=${encodeURIComponent(regionId)}`);
}

export function clerkPublicUrls(
  env: Record<string, string | undefined> = inlineablePathEnv(),
): {
  signInUrl: string;
  signUpUrl: string;
  afterSignInUrl: string;
  afterSignUpUrl: string;
  afterSignOutUrl: string;
} {
  return {
    signInUrl: withBasePath("/sign-in", env),
    signUpUrl: withBasePath("/sign-up", env),
    afterSignInUrl: withBasePath("/ops", env),
    afterSignUpUrl: withBasePath("/ops", env),
    // Never `/` — apex cortexmatter.com/ is a dummy A (522). Stay under basePath.
    afterSignOutUrl: withBasePath("/sign-in", env),
  };
}
