import Link from "next/link";

export function AuthChrome({
  clerkEnabled,
  children,
}: {
  clerkEnabled: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B1220] px-6 py-10 text-[#E8EEF9]">
      <div className="mb-6 text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#FF4D2E] font-mono text-sm font-bold text-black">
          AF
        </span>
        <h1 className="mt-3 text-lg font-semibold">AegisFlow</h1>
        <p className="text-sm text-[#8B9BB8]">Wildfire Operations Console</p>
      </div>

      {clerkEnabled ? (
        children
      ) : (
        <div className="w-full max-w-sm rounded-lg border border-[#1E2A40] bg-[#121A2B] p-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#FF4D2E]">
            DEV BYPASS · NON-PROD
          </p>
          <p className="mt-3 text-sm text-[#8B9BB8]">
            Clerk keys are not configured. Ops still loads for local QA.
          </p>
          <Link
            href="/ops"
            className="mt-4 inline-block rounded bg-[#FF4D2E] px-4 py-2 text-sm font-semibold text-black"
          >
            Continue
          </Link>
        </div>
      )}

      <p className="mt-6 font-mono text-[10px] uppercase tracking-wider text-[#8B9BB8]">
        Demo roles: Manager · Viewer
      </p>
    </div>
  );
}
