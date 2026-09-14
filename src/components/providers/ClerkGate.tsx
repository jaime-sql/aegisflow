// Server Component — no "use client" here so that clerkPublicUrls() can read
// server-only env vars (CLOUDFLARE_PROD, BASE_PATH) and compute the correct
// basePath-prefixed URLs before passing them to the client ClerkProvider.
import type { ReactNode } from "react";
import { clerkPublicUrls } from "@/lib/base-path";
import { ClerkProviderClient } from "./ClerkProviderClient";

/**
 * Must render ClerkProvider on the first SSR pass when keys exist.
 * A client-only delayed provider leaves <SignIn> / <SignUp> without context
 * on the OpenNext Worker and those pages return HTTP 500.
 */
export function ClerkGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  if (!enabled) {
    return <>{children}</>;
  }

  const urls = clerkPublicUrls();
  return (
    <ClerkProviderClient
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl={urls.signInUrl}
      signUpUrl={urls.signUpUrl}
      signInFallbackRedirectUrl={urls.afterSignInUrl}
      signUpFallbackRedirectUrl={urls.afterSignUpUrl}
      afterSignOutUrl={urls.afterSignOutUrl}
    >
      {children}
    </ClerkProviderClient>
  );
}
