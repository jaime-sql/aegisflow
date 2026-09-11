import { SignIn } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/auth/config";
import Link from "next/link";

export default function SignInPage() {
  if (!isClerkConfigured()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#07090d] p-6 text-center">
        <p className="font-mono text-xs tracking-[0.2em] text-[#ff6b2c]">
          DEV BYPASS · NON-PROD
        </p>
        <h1 className="text-xl font-semibold">Clerk keys are not configured</h1>
        <p className="max-w-md text-sm text-[#8b98a8]">
          Copy <code className="font-mono text-[#5ce1e6]">.env.example</code> to{" "}
          <code className="font-mono text-[#5ce1e6]">.env.local</code> and add
          Clerk keys to enable sign-in. Until then, Ops loads without auth.
        </p>
        <Link href="/" className="text-sm text-[#5ce1e6] underline">
          Continue to Ops →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07090d]">
      <SignIn
        appearance={{
          variables: {
            colorBackground: "#0e1218",
            colorText: "#e8eef6",
            colorPrimary: "#ff6b2c",
            colorInputBackground: "#121821",
            colorInputText: "#e8eef6",
          },
        }}
      />
    </div>
  );
}
