import { SignUp } from "@clerk/nextjs";
import { AuthChrome } from "@/components/ops/AuthFrame";
import { clerkAuthAppearance } from "@/lib/auth/clerk-appearance";
import { isClerkConfigured } from "@/lib/auth/config";

export default function SignUpPage() {
  const clerkEnabled = isClerkConfigured();
  if (!clerkEnabled) {
    return <AuthChrome clerkEnabled={false} />;
  }
  return (
    <AuthChrome clerkEnabled>
      {/* Clerk v6 + Next.js App Router: no path/routing props needed. */}
      <SignUp appearance={clerkAuthAppearance} />
    </AuthChrome>
  );
}
