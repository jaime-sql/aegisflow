import { SignUp } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/auth/config";
import Link from "next/link";

export default function SignUpPage() {
  if (!isClerkConfigured()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#07090d] p-6 text-center">
        <p className="font-mono text-xs tracking-[0.2em] text-[#ff6b2c]">
          DEV BYPASS · NON-PROD
        </p>
        <h1 className="text-xl font-semibold">Clerk keys are not configured</h1>
        <Link href="/" className="text-sm text-[#5ce1e6] underline">
          Continue to Ops →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07090d]">
      <SignUp
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
