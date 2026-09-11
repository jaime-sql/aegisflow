import { isAppPath, originPath, rewriteLocation } from "./path";

export interface PathRouterEnv {
  BASE_PATH: string;
  PUBLIC_ORIGIN: string;
  /** Service binding to the OpenNext Worker named `aegisflow`. */
  AEGISFLOW?: { fetch: (input: Request) => Promise<Response> };
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-ew-via",
  "cdn-loop",
]);

function filterRequestHeaders(headers: Headers): Headers {
  const out = new Headers();
  for (const [key, value] of headers) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      out.set(key, value);
    }
  }
  return out;
}

const worker = {
  async fetch(request: Request, env: PathRouterEnv): Promise<Response> {
    const url = new URL(request.url);
    const basePath = env.BASE_PATH || "/aegisflow";

    if (!isAppPath(url.pathname, basePath)) {
      return new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (!env.AEGISFLOW) {
      return new Response(
        "AegisFlow path Worker is missing the AEGISFLOW service binding",
        {
          status: 502,
          headers: { "content-type": "text/plain; charset=utf-8" },
        },
      );
    }

    const dest = new URL(url.href);
    dest.pathname = originPath(url.pathname);

    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers: filterRequestHeaders(request.headers),
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      init.duplex = "half";
    }

    // Service binding only. The empty Pages project (HTTP 522) is not a fallback.
    const bound = await env.AEGISFLOW.fetch(new Request(dest.toString(), init));
    return new Response(bound.body, {
      status: bound.status,
      statusText: bound.statusText,
      headers: publicResponseHeaders(bound.headers, url, basePath),
    });
  },
};

function publicResponseHeaders(
  incoming: Headers,
  requestUrl: URL,
  basePath: string,
): Headers {
  const headers = new Headers(incoming);
  const location = headers.get("Location");
  if (location) {
    headers.set("Location", rewriteLocation(location, requestUrl, basePath));
  }
  return headers;
}

export default worker;
