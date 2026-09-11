import assert from "node:assert/strict";
import { isClerkPublicPath, signInRedirectUrl } from "../src/lib/auth/middleware-routes";

assert.equal(isClerkPublicPath("/sign-in"), true);
assert.equal(isClerkPublicPath("/sign-in/sso-callback"), true);
assert.equal(isClerkPublicPath("/sign-up"), true);
assert.equal(isClerkPublicPath("/aegisflow/sign-in"), true);
assert.equal(isClerkPublicPath("/aegisflow/sign-in/"), true);
assert.equal(isClerkPublicPath("/aegisflow/sign-up/continue"), true);
assert.equal(isClerkPublicPath("/ops"), false);
assert.equal(isClerkPublicPath("/aegisflow/ops"), false);
assert.equal(isClerkPublicPath("/"), false);
assert.equal(isClerkPublicPath("/aegisflow"), false);

const prodOps = new URL("https://aegisflow.example/aegisflow/ops");
const prodSignIn = signInRedirectUrl(prodOps, { BASE_PATH: "/aegisflow" });
assert.equal(prodSignIn.pathname, "/aegisflow/sign-in");
assert.equal(prodSignIn.searchParams.get("redirect_url"), "/aegisflow/ops");

const prodViaFlag = signInRedirectUrl(
  new URL("https://cortexmatter.com/aegisflow"),
  { CLOUDFLARE_PROD: "true" },
);
assert.equal(prodViaFlag.pathname, "/aegisflow/sign-in");
assert.equal(prodViaFlag.searchParams.get("redirect_url"), "/aegisflow");

const localOps = signInRedirectUrl(new URL("http://localhost:3000/ops"), {});
assert.equal(localOps.pathname, "/sign-in");
assert.equal(localOps.searchParams.get("redirect_url"), "/ops");

const alreadySignIn = signInRedirectUrl(
  new URL("https://cortexmatter.com/aegisflow/sign-in"),
  { BASE_PATH: "/aegisflow" },
);
assert.equal(alreadySignIn.searchParams.has("redirect_url"), false);

console.log("OK  clerk middleware public paths + sign-in redirect");
