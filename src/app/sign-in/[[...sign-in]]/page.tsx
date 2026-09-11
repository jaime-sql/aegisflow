import { SignIn } from "@clerk/nextjs";
import { AuthChrome } from "@/components/ops/AuthFrame";
import { isClerkConfigured } from "@/lib/auth/config";

export default function SignInPage() {
  const clerkEnabled = isClerkConfigured();
  if (!clerkEnabled) {
    return <AuthChrome clerkEnabled={false} />;
  }
  return (
    <AuthChrome clerkEnabled>
      <SignIn
        appearance={{
          variables: {
            colorBackground: "#121A2B",
            colorText: "#E8EEF9",
            colorPrimary: "#FF4D2E",
            colorInputBackground: "#0B1220",
            colorInputText: "#E8EEF9",
          },
        }}
      />
    </AuthChrome>
  );
}
