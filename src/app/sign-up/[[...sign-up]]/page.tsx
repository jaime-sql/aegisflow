import { SignUp } from "@clerk/nextjs";
import { AuthChrome } from "@/components/ops/AuthFrame";
import { clerkAuthAppearance } from "@/lib/auth/clerk-appearance";
import { isClerkConfigured } from "@/lib/auth/config";
import { clerkPublicUrls } from "@/lib/base-path";

export default function SignUpPage() {
  const clerkEnabled = isClerkConfigured();
  if (!clerkEnabled) {
    return <AuthChrome clerkEnabled={false} />;
  }
  const urls = clerkPublicUrls();
  return (
    <AuthChrome clerkEnabled>
      <SignUp
        // Same fix as sign-in: path must be basePath-relative.
        // Next.js strips /aegisflow before Clerk processes the URL.
        path="/sign-up"
        routing="path"
        signInUrl={urls.signInUrl}
        fallbackRedirectUrl={urls.afterSignUpUrl}
        appearance={clerkAuthAppearance}
      />
    </AuthChrome>
  );
}
