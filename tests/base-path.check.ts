import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  absoluteAppUrl,
  clerkPublicUrls,
  inferBasePathFromPathname,
  opsIncidentUrl,
  opsRegionHref,
  resolveBasePath,
  withBasePath,
} from "../src/lib/base-path";

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

assert.equal(inferBasePathFromPathname("/ops"), "");
assert.equal(inferBasePathFromPathname("/api/ops/incident"), "");
assert.equal(inferBasePathFromPathname("/aegisflow"), "/aegisflow");
assert.equal(inferBasePathFromPathname("/aegisflow/ops"), "/aegisflow");
assert.equal(inferBasePathFromPathname("/aegisflow/api/ops/incident"), "/aegisflow");
assert.equal(inferBasePathFromPathname("/aegisflowchart"), "");

// Empty client `process.env` object + live Worker pathname must still prefix.
assert.equal(
  withBasePath("/api/ops/incident", {}, "/aegisflow/ops"),
  "/aegisflow/api/ops/incident",
);
assert.equal(withBasePath("/api/ops/incident", {}, "/ops"), "/api/ops/incident");

const workerOps = "https://aegisflow.jaime-8a8.workers.dev/aegisflow/ops";
assert.equal(
  opsIncidentUrl("cascade", workerOps),
  "https://aegisflow.jaime-8a8.workers.dev/aegisflow/api/ops/incident?region=cascade",
);
assert.equal(
  opsIncidentUrl("el-salvador", workerOps),
  "https://aegisflow.jaime-8a8.workers.dev/aegisflow/api/ops/incident?region=el-salvador",
);
assert.equal(
  opsIncidentUrl("cascade", "http://localhost:3000/ops"),
  "http://localhost:3000/api/ops/incident?region=cascade",
);
assert.equal(
  opsIncidentUrl("cascade", "https://cortexmatter.com/aegisflow/ops"),
  "https://cortexmatter.com/aegisflow/api/ops/incident?region=cascade",
);
assert.doesNotMatch(opsIncidentUrl("cascade", workerOps), /^https?:\/\/[^/]+\/api\//);

assert.equal(opsRegionHref("cascade", workerOps), "/aegisflow/ops?region=cascade");
assert.equal(
  opsRegionHref("cascade", `${workerOps}?role=viewer`),
  "/aegisflow/ops?role=viewer&region=cascade",
);
assert.equal(opsRegionHref("el-salvador", workerOps), "/aegisflow/ops?region=el-salvador");
assert.equal(
  opsRegionHref("cascade", "http://localhost:3000/ops"),
  "/ops?region=cascade",
);
assert.doesNotMatch(opsRegionHref("cascade", workerOps), /^\/ops(\?|$)/);
assert.doesNotMatch(opsRegionHref("cascade", workerOps), /^https?:\/\/cortexmatter\.com\/?$/);

assert.equal(
  absoluteAppUrl("/api/ops/firms-verify?region=cascade", workerOps),
  "https://aegisflow.jaime-8a8.workers.dev/aegisflow/api/ops/firms-verify?region=cascade",
);

const src = readFileSync("src/lib/base-path.ts", "utf8");
assert.match(src, /process\.env\.NEXT_PUBLIC_BASE_PATH/);
assert.match(src, /process\.env\.BASE_PATH/);
assert.match(src, /process\.env\.CLOUDFLARE_PROD/);
assert.match(src, /inlineablePathEnv/);
assert.doesNotMatch(
  src,
  /env: Record<string, string \| undefined> = process\.env/,
);

console.log("OK  base-path + Clerk URL helpers");
