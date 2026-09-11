import { clerkPublicUrls } from "@/lib/base-path";

/** Paths Clerk must not send through auth.protect() / sign-in bounce. */
export function isClerkPublicPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    path === "/sign-in" ||
    path.startsWith("/sign-in/") ||
    path === "/sign-up" ||
    path.startsWith("/sign-up/") ||
    path === "/aegisflow/sign-in" ||
    path.startsWith("/aegisflow/sign-in/") ||
    path === "/aegisflow/sign-up" ||
    path.startsWith("/aegisflow/sign-up/")
  );
}

/**
 * Absolute sign-in URL for middleware redirects.
 * Uses `BASE_PATH` / `CLOUDFLARE_PROD` / inlined `NEXT_PUBLIC_*` so OpenNext
 * middleware does not fall through to Clerk's protect-rewrite 404 when
 * `NEXT_PUBLIC_CLERK_SIGN_IN_URL` is missing from the Worker runtime.
 */
export function signInRedirectUrl(
  requestUrl: URL,
  env: Record<string, string | undefined> = process.env,
): URL {
  const { signInUrl } = clerkPublicUrls(env);
  const dest = new URL(signInUrl, requestUrl.origin);
  if (!isClerkPublicPath(requestUrl.pathname)) {
    dest.searchParams.set(
      "redirect_url",
      `${requestUrl.pathname}${requestUrl.search}`,
    );
  }
  return dest;
}
