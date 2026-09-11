import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isAppPath,
  isPreviewHost,
  originPath,
  rewriteLocation,
} from "../workers/aegisflow-path/src/path";

assert.equal(isAppPath("/aegisflow"), true);
assert.equal(isAppPath("/aegisflow/"), true);
assert.equal(isAppPath("/aegisflow/ops"), true);
assert.equal(isAppPath("/aegisflow/_next/static/x.js"), true);
assert.equal(isAppPath("/"), false);
assert.equal(isAppPath("/ops"), false);
assert.equal(isAppPath("/other"), false);
assert.equal(isAppPath("/aegisflow-extra"), false);

assert.equal(isPreviewHost("aegisflow.pages.dev"), true);
assert.equal(isPreviewHost("aegisflow.jaime-8a8.workers.dev"), true);
assert.equal(isPreviewHost("accounts.clerk.dev"), false);

// OpenNext + Next.js basePath: do not strip /aegisflow (unlike Rosario static export).
assert.equal(originPath("/aegisflow"), "/aegisflow");
assert.equal(originPath("/aegisflow/"), "/aegisflow/");
assert.equal(originPath("/aegisflow/ops"), "/aegisflow/ops");
assert.equal(originPath("/aegisflow/_next/static/x.js"), "/aegisflow/_next/static/x.js");

const requestUrl = new URL("https://cortexmatter.com/aegisflow/ops");
assert.equal(
  rewriteLocation("https://aegisflow.pages.dev/aegisflow/sign-in", requestUrl),
  "https://cortexmatter.com/aegisflow/sign-in",
);
assert.equal(
  rewriteLocation("https://aegisflow.jaime-8a8.workers.dev/aegisflow/sign-in", requestUrl),
  "https://cortexmatter.com/aegisflow/sign-in",
);
assert.equal(
  rewriteLocation("/sign-in", requestUrl),
  "https://cortexmatter.com/aegisflow/sign-in",
);
assert.equal(
  rewriteLocation("https://accounts.clerk.dev/v1/foo", requestUrl),
  "https://accounts.clerk.dev/v1/foo",
);

const wrangler = readFileSync("workers/aegisflow-path/wrangler.jsonc", "utf8");
assert.match(wrangler, /"pattern": "cortexmatter.com\/aegisflow"/);
assert.match(wrangler, /"pattern": "cortexmatter.com\/aegisflow\/\*"/);
assert.equal(
  [...wrangler.matchAll(/"pattern":\s*"([^"]+)"/g)].every((m) =>
    m[1] === "cortexmatter.com/aegisflow" || m[1] === "cortexmatter.com/aegisflow/*",
  ),
  true,
);
assert.doesNotMatch(wrangler, /cortexmatter.com\/"/);
assert.doesNotMatch(wrangler, /"pattern": "cortexmatter.com"/);
assert.doesNotMatch(wrangler, /PAGES_ORIGIN/);
assert.doesNotMatch(wrangler, /aegisflow\.pages\.dev/);

const appWrangler = readFileSync("wrangler.jsonc", "utf8");
assert.doesNotMatch(appWrangler, /cortexmatter.com/);
assert.match(appWrangler, /"BASE_PATH": "\/aegisflow"/);

const pathWorker = readFileSync("workers/aegisflow-path/src/index.ts", "utf8");
assert.match(pathWorker, /publicResponseHeaders/);
assert.match(pathWorker, /AEGISFLOW\.fetch/);
assert.doesNotMatch(pathWorker, /PAGES_ORIGIN/);
assert.doesNotMatch(pathWorker, /pages\.dev/);
assert.match(pathWorker, /status: 502/);

console.log("OK  aegisflow-path Worker only covers /aegisflow");
