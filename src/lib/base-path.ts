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
 */
export const PROD_BASE_PATH = "/aegisflow";

export function resolveBasePath(
  env: Record<string, string | undefined> = process.env,
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
  env: Record<string, string | undefined> = process.env,
): string {
  const base = resolveBasePath(env);
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function clerkPublicUrls(
  env: Record<string, string | undefined> = process.env,
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
