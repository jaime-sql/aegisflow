"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";

export function ClerkGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [Provider, setProvider] = useState<ComponentType<{ children: ReactNode }> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    import("@clerk/nextjs").then((mod) => {
      if (!cancelled) {
        setProvider(() => mod.ClerkProvider);
      }
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
