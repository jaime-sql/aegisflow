"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { clerkPublicUrls } from "@/lib/base-path";

export function ClerkGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [Provider, setProvider] = useState<ComponentType<{ children: ReactNode }> | null>(
    null,
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    import("@clerk/nextjs").then((mod) => {
      if (cancelled) return;
      const urls = clerkPublicUrls();
      function BoundProvider({ children }: { children: ReactNode }) {
        return (
          <mod.ClerkProvider
            signInUrl={urls.signInUrl}
            signUpUrl={urls.signUpUrl}
            signInFallbackRedirectUrl={urls.afterSignInUrl}
            signUpFallbackRedirectUrl={urls.afterSignUpUrl}
          >
            {children}
          </mod.ClerkProvider>
        );
      }
      setProvider(() => BoundProvider);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled || !Provider) {
    return <>{children}</>;
  }
  return <Provider>{children}</Provider>;
}
