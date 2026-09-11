"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { clerkPublicUrls } from "@/lib/base-path";

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
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl={urls.signInUrl}
      signUpUrl={urls.signUpUrl}
      signInFallbackRedirectUrl={urls.afterSignInUrl}
      signUpFallbackRedirectUrl={urls.afterSignUpUrl}
    >
      {children}
    </ClerkProvider>
  );
}
