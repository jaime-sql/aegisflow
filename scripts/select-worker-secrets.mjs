#!/usr/bin/env node
/**
 * cloudflare/wrangler-action getSecret() throws if any name in `secrets:` is
 * empty. Cloudflare Prod must still deploy when optional LLM / Modal /
 * ElevenLabs (and ingest) keys are unset — adapters already fixture-fallback
 * and Brief aloud shows muted SIM.
 *
 * Prints skipped/uploaded names to stderr (never values). Writes a multiline
 * GitHub Actions output `list` of non-empty secret names.
 */
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_WORKER_SECRETS = [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
];

/** Uploaded when present; skipped when empty. Missing OpenAI must not fail Prod. */
export const OPTIONAL_WORKER_SECRETS = [
  "FIRMS_MAP_KEY",
  "GCP_SA_JSON",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "MODAL_TOKEN_ID",
  "MODAL_TOKEN_SECRET",
  "MODAL_ENDPOINT",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
];

/** @param {unknown} value */
export function presentValue(value) {
  return Boolean(String(value ?? "").trim());
}

/**
 * Env-like map for Worker secret selection. Intentionally not ProcessEnv:
 * tests pass partial objects without NODE_ENV, and Next.js makes NODE_ENV
 * required on ProcessEnv so `next build` would reject those fixtures.
 *
 * @param {NodeJS.Dict<string>} [env]
 * @returns {{ missingRequired: string[], present: string[], skipped: string[] }}
 */
export function selectWorkerSecrets(env = process.env) {
  const missingRequired = REQUIRED_WORKER_SECRETS.filter((name) => !presentValue(env[name]));
  const present = [];
  const skipped = [];
  for (const name of REQUIRED_WORKER_SECRETS) {
    if (presentValue(env[name])) present.push(name);
  }
  for (const name of OPTIONAL_WORKER_SECRETS) {
    if (presentValue(env[name])) present.push(name);
    else skipped.push(name);
  }
  return { missingRequired, present, skipped };
}

/**
 * @param {string[]} names
 * @param {string} [delimiter]
 */
export function githubOutputList(names, delimiter = "AEGISFLOW_WORKER_SECRETS") {
  return `list<<${delimiter}\n${names.join("\n")}\n${delimiter}\n`;
}

function isMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(entry);
  } catch {
    return false;
  }
}

function main() {
  const result = selectWorkerSecrets(process.env);
  if (result.missingRequired.length) {
    console.error(
      `::error::Required Worker secrets missing: ${result.missingRequired.join(", ")}. Clerk keys are required to boot Prod.`,
    );
    process.exit(1);
  }
  if (result.skipped.length) {
    console.error(`Skipping empty optional Worker secrets: ${result.skipped.join(", ")}`);
    console.error(
      "::notice::Agent / ElevenLabs / ingest keys are optional. Empty values are not uploaded (wrangler-action would fail). Missing OpenAI leaves AgentChip on SIM; missing ElevenLabs leaves Brief aloud on muted SIM.",
    );
  }
  console.error(`Uploading Worker secrets: ${result.present.join(", ")}`);
  const chunk = githubOutputList(result.present);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, chunk);
  } else {
    process.stdout.write(chunk);
  }
}

if (isMain()) main();
