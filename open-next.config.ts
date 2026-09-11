import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Stage 1: no R2 incremental cache. Clerk middleware + RSC + /api need the
// OpenNext Worker runtime — static `output: "export"` cannot run clerkMiddleware.
export default defineCloudflareConfig();
