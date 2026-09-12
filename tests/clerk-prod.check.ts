import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appearance = readFileSync("src/lib/auth/clerk-appearance.ts", "utf8");
assert.match(appearance, /colorText: "#E8EEF9"/);
assert.match(appearance, /socialButtonsBlockButton:/);
assert.match(appearance, /backgroundColor: "#0B1220"/);
assert.match(appearance, /border: "1px solid #1E2A40"/);
assert.match(appearance, /color: "#E8EEF9"/);
assert.match(appearance, /backgroundColor: "#162033"/);
assert.match(appearance, /color: "#FFFFFF"/);
assert.match(appearance, /socialButtonsBlockButtonText:/);
assert.match(appearance, /socialButtonsProviderIcon:/);
assert.match(appearance, /color: "#8B9BB8"/);

const signIn = readFileSync("src/app/sign-in/[[...sign-in]]/page.tsx", "utf8");
const signUp = readFileSync("src/app/sign-up/[[...sign-up]]/page.tsx", "utf8");
assert.match(signIn, /clerkAuthAppearance/);
assert.match(signUp, /clerkAuthAppearance/);

const gate = readFileSync("src/components/providers/ClerkGate.tsx", "utf8");
assert.match(gate, /ClerkProvider/);
assert.match(gate, /afterSignOutUrl=\{urls\.afterSignOutUrl\}/);
assert.doesNotMatch(gate, /useEffect\s*\(/);
assert.doesNotMatch(gate, /import\("@clerk\/nextjs"\)/);

const userButton = readFileSync("src/components/ops/ClerkUserButton.tsx", "utf8");
assert.match(userButton, /afterSignOutUrl=\{afterSignOutUrl\}/);
assert.match(userButton, /clerkPublicUrls/);

const nextConfig = readFileSync("next.config.ts", "utf8");
assert.match(nextConfig, /NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL: clerkUrls\.afterSignOutUrl/);

const middleware = readFileSync("src/middleware.ts", "utf8");
assert.match(middleware, /signInRedirectUrl/);
assert.match(middleware, /isClerkPublicPath/);
assert.doesNotMatch(middleware, /await auth\.protect|auth\.protect\(/);
assert.match(middleware, /"\/"/);

const wrangler = readFileSync("wrangler.jsonc", "utf8");
assert.match(wrangler, /"CLOUDFLARE_PROD": "true"/);
assert.match(wrangler, /"BASE_PATH": "\/aegisflow"/);
assert.match(wrangler, /"NEXT_PUBLIC_CLERK_SIGN_IN_URL": "\/aegisflow\/sign-in"/);
assert.match(wrangler, /"NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL": "\/aegisflow\/sign-in"/);
assert.match(wrangler, /"NEXTJS_ENV": "production"/);

const workflow = readFileSync(".github/workflows/cloudflare-prod.yml", "utf8");
assert.match(workflow, /command: deploy/);
assert.match(workflow, /CLERK_SECRET_KEY/);
assert.match(
  workflow,
  /secrets: \|[\s\S]*CLERK_SECRET_KEY[\s\S]*NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/,
);

const pathWorker = readFileSync("workers/aegisflow-path/src/index.ts", "utf8");
assert.match(pathWorker, /publicResponseHeaders/);
assert.match(pathWorker, /rewriteLocation/);
assert.match(pathWorker, /internalOriginUrl/);
assert.match(pathWorker, /applyForwardedHeaders/);

const pathWrangler = readFileSync("workers/aegisflow-path/wrangler.jsonc", "utf8");
assert.match(
  pathWrangler,
  /"AEGISFLOW_ORIGIN": "https:\/\/aegisflow\.jaime-8a8\.workers\.dev"/,
);

console.log("OK  clerk prod wiring (SSR provider, middleware, wrangler vars)");
