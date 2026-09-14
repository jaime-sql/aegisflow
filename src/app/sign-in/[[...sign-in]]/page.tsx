import { SignIn } from "@clerk/nextjs";
import { AuthChrome } from "@/components/ops/AuthFrame";
import { clerkAuthAppearance } from "@/lib/auth/clerk-appearance";
import { isClerkConfigured } from "@/lib/auth/config";
import { clerkPublicUrls } from "@/lib/base-path";

export default function SignInPage() {
  const clerkEnabled = isClerkConfigured();
  if (!clerkEnabled) {
    return <AuthChrome clerkEnabled={false} />;
  }
  const urls = clerkPublicUrls();
  return (
    <AuthChrome clerkEnabled>
      <SignIn
        // Clerk's `path` prop must be relative to Next.js basePath.
        // Next.js strips /aegisflow before Clerk sees the URL, so passing
        // urls.signInUrl (/aegisflow/sign-in) causes Clerk to never match
        // the route and the widget never mounts. Use the bare path instead.
        path="/sign-in"
        routing="path"
        signUpUrl={urls.signUpUrl}
        fallbackRedirectUrl={urls.afterSignInUrl}
        appearance={clerkAuthAppearance}
      />
    </AuthChrome>
  );
}
