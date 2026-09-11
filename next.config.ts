import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { clerkPublicUrls, resolveBasePath } from "./src/lib/base-path";

const basePath = resolveBasePath();
const clerkUrls = clerkPublicUrls();

const nextConfig: NextConfig = {
  // MapLibre CSS + workers are bundled from node_modules.
  reactStrictMode: true,
  // OpenNext / Cloudflare Images are not wired in Stage 1.
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: clerkUrls.signInUrl,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: clerkUrls.signUpUrl,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: clerkUrls.afterSignInUrl,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: clerkUrls.afterSignUpUrl,
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: clerkUrls.afterSignInUrl,
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: clerkUrls.afterSignUpUrl,
  },
};

export default nextConfig;

if (process.env.NODE_ENV === "development") {
  void initOpenNextCloudflareForDev();
}
