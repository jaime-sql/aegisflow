import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/auth/config";
import { isClerkPublicPath, signInRedirectUrl } from "@/lib/auth/middleware-routes";
import { clerkPublicUrls } from "@/lib/base-path";

function clerkOptions() {
  const urls = clerkPublicUrls();
  return {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    signInUrl: urls.signInUrl,
    signUpUrl: urls.signUpUrl,
  };
}

const clerkHandler = clerkMiddleware(async (auth, request) => {
  if (isClerkPublicPath(request.nextUrl.pathname)) {
    return;
  }

  // Avoid Clerk protect() rewrite: with Dev keys / a missing signInUrl in the
  // Worker runtime it turns /ops into a 404 (x-clerk-auth-reason: protect-rewrite).
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(signInRedirectUrl(new URL(request.url)));
  }
}, () => clerkOptions());

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!isClerkConfigured()) {
    return NextResponse.next();
  }
  return clerkHandler(req, event);
}

export const config = {
  matcher: [
    // Next.js matcher `/((?!_next)...` does not match `/` after basePath strip.
    "/",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
