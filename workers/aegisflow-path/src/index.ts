import { isAppPath, originPath, rewriteLocation } from "./path";

export interface PathRouterEnv {
  PAGES_ORIGIN: string;
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

    // Prefer the OpenNext service binding so Clerk sees cortexmatter.com/aegisflow
    // (Host + path) instead of a pages.dev/workers.dev preview host.
    const upstream = env.AEGISFLOW
      ? await env.AEGISFLOW.fetch(new Request(dest.toString(), init))
      : await fetch(withPagesOrigin(dest, env.PAGES_ORIGIN), init);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: publicResponseHeaders(upstream.headers, url, env.PAGES_ORIGIN, basePath),
    });
  },
};

function withPagesOrigin(dest: URL, pagesOrigin: string): URL {
  const out = new URL(dest.href);
  out.host = new URL(pagesOrigin).host;
  out.protocol = "https:";
  return out;
}

function publicResponseHeaders(
  incoming: Headers,
  requestUrl: URL,
  pagesOrigin: string,
  basePath: string,
): Headers {
  const headers = new Headers(incoming);
  const location = headers.get("Location");
  if (location) {
    headers.set("Location", rewriteLocation(location, requestUrl, pagesOrigin, basePath));
  }
  return headers;
}

export default worker;
