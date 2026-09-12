import assert from "node:assert/strict";
import { clerkPublicUrls, resolveBasePath, withBasePath } from "../src/lib/base-path";

assert.equal(resolveBasePath({ BASE_PATH: "/aegisflow" }), "/aegisflow");
assert.equal(resolveBasePath({ BASE_PATH: "aegisflow/" }), "/aegisflow");
assert.equal(resolveBasePath({ CLOUDFLARE_PROD: "true" }), "/aegisflow");
assert.equal(resolveBasePath({ CF_PAGES: "1" }), "/aegisflow");
assert.equal(resolveBasePath({ NEXT_PUBLIC_BASE_PATH: "/aegisflow" }), "/aegisflow");
assert.equal(resolveBasePath({}), "");
assert.equal(resolveBasePath({ BASE_PATH: "/" }), "");

assert.equal(withBasePath("/ops", {}), "/ops");
assert.equal(withBasePath("/ops", { CLOUDFLARE_PROD: "true" }), "/aegisflow/ops");
assert.equal(withBasePath("ops", { BASE_PATH: "/aegisflow" }), "/aegisflow/ops");
assert.equal(
  withBasePath("/leaflet/marker-icon.png", { BASE_PATH: "/aegisflow" }),
  "/aegisflow/leaflet/marker-icon.png",
);

const localClerk = clerkPublicUrls({});
assert.equal(localClerk.signInUrl, "/sign-in");
assert.equal(localClerk.afterSignInUrl, "/ops");
assert.equal(localClerk.afterSignOutUrl, "/sign-in");

const prodClerk = clerkPublicUrls({ BASE_PATH: "/aegisflow" });
assert.equal(prodClerk.signInUrl, "/aegisflow/sign-in");
assert.equal(prodClerk.signUpUrl, "/aegisflow/sign-up");
assert.equal(prodClerk.afterSignInUrl, "/aegisflow/ops");
assert.equal(prodClerk.afterSignUpUrl, "/aegisflow/ops");
assert.equal(prodClerk.afterSignOutUrl, "/aegisflow/sign-in");
assert.ok(prodClerk.afterSignOutUrl.startsWith("/aegisflow"));
assert.notEqual(prodClerk.afterSignOutUrl, "/");
assert.doesNotMatch(prodClerk.afterSignOutUrl, /^https?:\/\/cortexmatter\.com\/?$/);

const cfClerk = clerkPublicUrls({ CLOUDFLARE_PROD: "true" });
assert.equal(cfClerk.afterSignOutUrl, "/aegisflow/sign-in");

console.log("OK  base-path + Clerk URL helpers");
