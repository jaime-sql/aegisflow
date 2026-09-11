"use client";

import { ClerkProvider } from "@clerk/nextjs";

export function ClerkGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) {
    return <>{children}</>;
  }
  return <ClerkProvider>{children}</ClerkProvider>;
}
