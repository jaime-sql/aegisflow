"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

interface ClerkProviderClientProps {
  publishableKey: string | undefined;
  signInUrl: string;
  signUpUrl: string;
  signInFallbackRedirectUrl: string;
  signUpFallbackRedirectUrl: string;
  afterSignOutUrl: string;
  children: ReactNode;
}

/**
 * Thin "use client" wrapper around ClerkProvider.
 * All URL props are computed server-side in ClerkGate (a Server Component)
 * so that server-only env vars (CLOUDFLARE_PROD, BASE_PATH) are available
 * and the basePath-prefixed afterSignOutUrl is correct in production.
 */
export function ClerkProviderClient({
  publishableKey,
  signInUrl,
  signUpUrl,
  signInFallbackRedirectUrl,
  signUpFallbackRedirectUrl,
  afterSignOutUrl,
  children,
}: ClerkProviderClientProps) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      signInFallbackRedirectUrl={signInFallbackRedirectUrl}
      signUpFallbackRedirectUrl={signUpFallbackRedirectUrl}
      afterSignOutUrl={afterSignOutUrl}
    >
      {children}
    </ClerkProvider>
  );
}
