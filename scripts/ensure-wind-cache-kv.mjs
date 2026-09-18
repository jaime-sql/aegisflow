#!/usr/bin/env node
/**
 * Idempotent KV bind for WeatherNext wind cache.
 *
 * Looks up (or creates) namespace title `aegisflow-WIND_CACHE` and writes the
 * id into wrangler.jsonc so `wrangler deploy` can bind `WIND_CACHE`.
 *
 * Needs CLOUDFLARE_API_TOKEN (+ account 8a8c9483df8e8a2a9adec437a0994fe4).
 * If the token cannot create KV, print Jaime's one-time command and exit 1.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BINDING = "WIND_CACHE";
const TITLE = "aegisflow-WIND_CACHE";
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "8a8c9483df8e8a2a9adec437a0994fe4";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = join(root, "wrangler.jsonc");

function wrangler(args) {
  return execFileSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function jaimeHelp(extra) {
  return [
    extra,
    "Jaime one-time (Workers KV edit on the Cloudflare API token):",
    "  npx wrangler kv namespace create WIND_CACHE",
    "Then paste the printed id into wrangler.jsonc kv_namespaces[0].id",
    "and re-run Cloudflare Prod.",
  ].join("\n");
}

function parseList(raw) {
  const text = String(raw || "").trim();
  const start = text.indexOf("[");
  if (start >= 0) {
    try {
      const data = JSON.parse(text.slice(start));
      return Array.isArray(data) ? data : [];
    } catch {
      // fall through
    }
  }
  const rows = [];
  for (const line of text.split("\n")) {
    const id = (line.match(/\b([a-f0-9]{32})\b/i) || [])[1];
    const title = (line.match(/aegisflow-WIND_CACHE|WIND_CACHE/) || [])[0];
    if (id) rows.push({ id, title: title || "" });
  }
  return rows;
}

function findId(rows) {
  for (const row of rows) {
    const title = String(row.title || row.name || "");
    if (title === TITLE || title === BINDING || title.endsWith(`-${BINDING}`)) {
      return String(row.id || "");
    }
  }
  return "";
}

function parseCreateId(raw) {
  const match = raw.match(/id\s*=\s*"([a-f0-9]{32})"/i) || raw.match(/"id"\s*:\s*"([a-f0-9]{32})"/i);
  return match?.[1] || "";
}

function patchWrangler(id) {
  const text = readFileSync(wranglerPath, "utf8");
  let next = text.replace(
    /("binding":\s*"WIND_CACHE"[\s\S]*?"id":\s*")[^"]*(")/,
    `$1${id}$2`,
  );
  if (next === text) {
    next = text.replace(
      /("binding":\s*"WIND_CACHE")(\s*,)?/,
      `$1,\n    "id": "${id}"$2`,
    );
  }
  if (next === text && !text.includes(`"id": "${id}"`)) {
    throw new Error("could not patch wrangler.jsonc kv_namespaces id");
  }
  writeFileSync(wranglerPath, next);
}

function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error(
      jaimeHelp("CLOUDFLARE_API_TOKEN is missing; cannot bind WIND_CACHE."),
    );
    process.exit(1);
  }

  let id = "";
  try {
    const listed = wrangler(["kv", "namespace", "list"]);
    id = findId(parseList(listed));
  } catch (err) {
    console.warn("wrangler kv namespace list failed:", err?.stderr || err?.message || err);
  }

  if (!id) {
    try {
      const created = wrangler(["kv", "namespace", "create", BINDING]);
      process.stdout.write(created);
      id = parseCreateId(created);
    } catch (err) {
      const detail = String(err?.stderr || err?.message || err);
      console.error(jaimeHelp(`Could not create KV namespace ${TITLE}.\n${detail}`));
      process.exit(1);
    }
  }

  if (!id) {
    console.error(jaimeHelp("Created namespace but could not parse id."));
    process.exit(1);
  }

  patchWrangler(id);
  console.log(`WIND_CACHE bound to namespace ${id} (${TITLE}).`);
}

main();
