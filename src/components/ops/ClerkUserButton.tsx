"use client";

import { UserButton } from "@clerk/nextjs";
import { clerkPublicUrls } from "@/lib/base-path";

export function ClerkUserButton() {
  const { afterSignOutUrl } = clerkPublicUrls();
  // ClerkProvider.afterSignOutUrl is the v6 source of truth; UserButton still
  // accepts the (deprecated) prop in @clerk/nextjs ^6.33 and keeps the
  // dropdown from falling back to `/` if the provider env is missing.
  return <UserButton afterSignOutUrl={afterSignOutUrl} />;
}
