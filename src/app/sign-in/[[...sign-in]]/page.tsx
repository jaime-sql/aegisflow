import { SignIn } from "@clerk/nextjs";
import { AuthChrome } from "@/components/ops/AuthFrame";
import { clerkAuthAppearance } from "@/lib/auth/clerk-appearance";
import { isClerkConfigured } from "@/lib/auth/config";

export default function SignInPage() {
  const clerkEnabled = isClerkConfigured();
  if (!clerkEnabled) {
    return <AuthChrome clerkEnabled={false} />;
  }
  return (
    <AuthChrome clerkEnabled>
      {/*
       * Clerk v6 + Next.js App Router: do NOT pass path or routing props.
       * Clerk auto-detects path-based routing and reads NEXT_PUBLIC_CLERK_SIGN_IN_URL
       * from env. Passing path="/sign-in" or path="/aegisflow/sign-in" both
       * cause the widget to never mount — Clerk's internal path matching
       * conflicts with Next.js basePath stripping.
       */}
      <SignIn appearance={clerkAuthAppearance} />
    </AuthChrome>
  );
}
