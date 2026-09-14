export function isClerkConfigured(): boolean {
  // Only check the publishable key — it is a NEXT_PUBLIC_ var and gets inlined
  // into the build at compile time. CLERK_SECRET_KEY is a Cloudflare Worker
  // *runtime* secret (never present during `next build`), so checking it here
  // always returns false in production and suppresses the Clerk sign-in widget.
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}
