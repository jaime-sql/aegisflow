import type { IngestEnv, IngestFetch } from "./types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const BIGQUERY_SCOPE = "https://www.googleapis.com/auth/bigquery.readonly";

export type GcpServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

type CachedToken = { accessToken: string; expiresAtMs: number };

let tokenCache: CachedToken | null = null;

export function resetGcpTokenCache(): void {
  tokenCache = null;
}

function parseServiceAccount(raw: string): GcpServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GCP service-account JSON is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("GCP service-account JSON must be an object");
  }
  const rec = parsed as Record<string, unknown>;
  const client_email = rec.client_email;
  const private_key = rec.private_key;
  if (typeof client_email !== "string" || !client_email.includes("@")) {
    throw new Error("GCP service-account JSON missing client_email");
  }
  if (typeof private_key !== "string" || !private_key.includes("BEGIN")) {
    throw new Error("GCP service-account JSON missing private_key");
  }
  return {
    client_email,
    private_key: private_key.replace(/\\n/g, "\n"),
    project_id: typeof rec.project_id === "string" ? rec.project_id : undefined,
    token_uri: typeof rec.token_uri === "string" ? rec.token_uri : undefined,
  };
}

function readFileIfExists(path: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    if (!fs.existsSync(path)) return null;
    return fs.readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Worker secret `GCP_SA_JSON` (preferred) or Node ADC JSON / path.
 * Never log the return value — it contains a private key.
 */
export function loadServiceAccountFromEnv(
  env: IngestEnv = process.env,
): GcpServiceAccount | null {
  const direct =
    env.GCP_SA_JSON?.trim() ||
    env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim() ||
    "";
  if (direct.startsWith("{")) {
    return parseServiceAccount(direct);
  }
  const pathOrJson = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!pathOrJson) return null;
  if (pathOrJson.startsWith("{")) {
    return parseServiceAccount(pathOrJson);
  }
  const fromFile = readFileIfExists(pathOrJson);
  if (!fromFile) return null;
  return parseServiceAccount(fromFile);
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlJson(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

export async function signServiceAccountJwt(
  sa: GcpServiceAccount,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = b64urlJson({ alg: "RS256", typ: "JWT" });
  const aud = sa.token_uri || TOKEN_URL;
  const payload = b64urlJson({
    iss: sa.client_email,
    scope: BIGQUERY_SCOPE,
    aud,
    iat: nowSec,
    exp: nowSec + 3600,
  });
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${b64url(new Uint8Array(sig))}`;
}

export async function fetchGcpAccessToken(
  sa: GcpServiceAccount,
  deps: { fetch?: IngestFetch } = {},
): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs - 60_000 > now) {
    return tokenCache.accessToken;
  }
  const doFetch = deps.fetch ?? fetch;
  const assertion = await signServiceAccountJwt(sa);
  const tokenUri = sa.token_uri || TOKEN_URL;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await doFetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`GCP token HTTP ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("GCP token response missing access_token");
  }
  const expiresIn = Number(json.expires_in) || 3600;
  tokenCache = {
    accessToken: json.access_token,
    expiresAtMs: now + expiresIn * 1000,
  };
  return json.access_token;
}
