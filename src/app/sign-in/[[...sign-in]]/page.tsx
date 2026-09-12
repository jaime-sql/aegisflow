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
        path={urls.signInUrl}
        routing="path"
        signUpUrl={urls.signUpUrl}
        fallbackRedirectUrl={urls.afterSignInUrl}
        appearance={clerkAuthAppearance}
      />
    </AuthChrome>
  );
}
