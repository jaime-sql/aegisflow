import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  OPTIONAL_WORKER_SECRETS,
  REQUIRED_WORKER_SECRETS,
  githubOutputList,
  selectWorkerSecrets,
} from "../scripts/select-worker-secrets.mjs";

const clerkEnv = {
  CLERK_SECRET_KEY: "sk_test_clerk",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_clerk",
};

function skipsEmptyOptionalKeys() {
  const result = selectWorkerSecrets({
    ...clerkEnv,
    FIRMS_MAP_KEY: "firms",
    GCP_SA_JSON: '{"type":"service_account"}',
    ELEVENLABS_API_KEY: "sk_live_eleven",
    OPENAI_API_KEY: "",
    DEEPSEEK_API_KEY: "  ",
    MODAL_ENDPOINT: undefined,
    MODAL_TOKEN_ID: "",
    MODAL_TOKEN_SECRET: "",
    ELEVENLABS_VOICE_ID: "",
  });
  assert.deepEqual(result.missingRequired, []);
  assert.deepEqual(result.present, [
    "CLERK_SECRET_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "FIRMS_MAP_KEY",
    "GCP_SA_JSON",
    "ELEVENLABS_API_KEY",
  ]);
  assert.ok(result.skipped.includes("OPENAI_API_KEY"));
  assert.ok(result.skipped.includes("DEEPSEEK_API_KEY"));
  assert.ok(result.skipped.includes("MODAL_ENDPOINT"));
  assert.ok(result.skipped.includes("MODAL_TOKEN_ID"));
  assert.ok(result.skipped.includes("MODAL_TOKEN_SECRET"));
  assert.ok(result.skipped.includes("ELEVENLABS_VOICE_ID"));
  assert.ok(!result.present.includes("OPENAI_API_KEY"));
}

function includesOptionalKeysWhenPresent() {
  const result = selectWorkerSecrets({
    ...clerkEnv,
    OPENAI_API_KEY: "sk-test",
    DEEPSEEK_API_KEY: "ds-test",
    MODAL_ENDPOINT: "https://aegisflow-agents-run-agent.modal.run",
    MODAL_TOKEN_ID: "wk-test",
    MODAL_TOKEN_SECRET: "ws-test",
    ELEVENLABS_API_KEY: "sk_live_eleven",
    ELEVENLABS_VOICE_ID: "customVoice",
  });
  assert.deepEqual(result.skipped, ["FIRMS_MAP_KEY", "GCP_SA_JSON"]);
  assert.ok(result.present.includes("OPENAI_API_KEY"));
  assert.ok(result.present.includes("ELEVENLABS_API_KEY"));
  assert.ok(result.present.includes("ELEVENLABS_VOICE_ID"));
}

function failsClosedWithoutClerk() {
  const result = selectWorkerSecrets({
    OPENAI_API_KEY: "sk-test",
    ELEVENLABS_API_KEY: "sk_live_eleven",
  });
  assert.deepEqual(result.missingRequired, [
    "CLERK_SECRET_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  ]);
}

function cliWritesGithubOutputAndExitsOnMissingClerk() {
  const script = fileURLToPath(new URL("../scripts/select-worker-secrets.mjs", import.meta.url));
  const ok = execFileSync(process.execPath, [script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GITHUB_OUTPUT: "",
      CLERK_SECRET_KEY: "sk_test_clerk",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_clerk",
      ELEVENLABS_API_KEY: "sk_live_eleven",
      OPENAI_API_KEY: "",
      DEEPSEEK_API_KEY: "",
      MODAL_ENDPOINT: "",
      MODAL_TOKEN_ID: "",
      MODAL_TOKEN_SECRET: "",
    },
  });
  assert.match(ok, /list<<AEGISFLOW_WORKER_SECRETS/);
  assert.match(ok, /CLERK_SECRET_KEY/);
  assert.match(ok, /ELEVENLABS_API_KEY/);
  assert.doesNotMatch(ok, /OPENAI_API_KEY/);
  assert.equal(githubOutputList(["CLERK_SECRET_KEY"]).includes("CLERK_SECRET_KEY"), true);

  let failed = false;
  try {
    execFileSync(process.execPath, [script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GITHUB_OUTPUT: "",
        CLERK_SECRET_KEY: "",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      },
    });
  } catch (err) {
    failed = true;
    const stderr = String((err as { stderr?: string }).stderr || "");
    assert.match(stderr, /Required Worker secrets missing/);
    assert.match(stderr, /CLERK_SECRET_KEY/);
  }
  assert.equal(failed, true);
}

function nextBuildAcceptsPartialEnvMaps() {
  const script = readFileSync("scripts/select-worker-secrets.mjs", "utf8");
  assert.match(script, /@param \{NodeJS\.Dict<string>\}/);
  assert.doesNotMatch(script, /@param \{NodeJS\.ProcessEnv\}/);
  const tsconfig = readFileSync("tsconfig.json", "utf8");
  assert.match(tsconfig, /"exclude"[\s\S]*"tests"/);
}

function workflowSkipsEmptyWranglerActionSecrets() {
  const workflow = readFileSync(".github/workflows/cloudflare-prod.yml", "utf8");
  assert.match(workflow, /scripts\/select-worker-secrets\.mjs/);
  assert.match(workflow, /steps\.worker_secrets\.outputs\.list/);
  assert.doesNotMatch(
    workflow,
    /secrets: \|[\s\S]*OPENAI_API_KEY[\s\S]*DEEPSEEK_API_KEY/,
  );
  for (const name of [
    ...REQUIRED_WORKER_SECRETS,
    ...OPTIONAL_WORKER_SECRETS,
  ]) {
    assert.match(workflow, new RegExp(`${name}: \\$\\{\\{ secrets\\.`));
  }
  assert.match(workflow, /CLERK_SECRET_KEY_PRD/);
  assert.match(workflow, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_PRD/);
  assert.doesNotMatch(
    workflow,
    /secrets\.ELEVENLABS_VOICE_ID \|\| '21m00Tcm4TlvDq8ikWAM'/,
  );
  const wrangler = readFileSync("wrangler.jsonc", "utf8");
  assert.match(wrangler, /"ELEVENLABS_VOICE_ID": "21m00Tcm4TlvDq8ikWAM"/);
  const readme = readFileSync("README.md", "utf8");
  assert.match(readme, /OpenAI is not required to deploy/);
  assert.match(readme, /optional for Cloudflare Prod/i);
}

function main() {
  skipsEmptyOptionalKeys();
  includesOptionalKeysWhenPresent();
  failsClosedWithoutClerk();
  cliWritesGithubOutputAndExitsOnMissingClerk();
  nextBuildAcceptsPartialEnvMaps();
  workflowSkipsEmptyWranglerActionSecrets();
  console.log("OK  optional Cloudflare Prod Worker secrets (skip empty LLM / TTS keys)");
}

main();
