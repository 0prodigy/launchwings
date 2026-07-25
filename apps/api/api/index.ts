// Vercel Functions entrypoint (Node runtime). The Hono `app` (apps/api/src/app.ts)
// holds every route; vercel.json rewrites `/(.*) → /api` so this Function
// receives every path on the dot-api project.
//
// HISTORY: We previously used `@hono/node-server`'s `getRequestListener(app.fetch)`
// to bridge Node IncomingMessage ↔ Hono. On Vercel's Node runtime, this caused
// EVERY POST that read the request body (`c.req.text()`, `c.req.json()`, and
// transitively every tRPC mutation) to hang for the full 60s `maxDuration`,
// returning FUNCTION_INVOCATION_TIMEOUT. POSTs that didn't read the body
// (404 fast-paths, auth-rejections, GETs to mutation paths giving 405) all
// returned in <1s. Diagnosis: a `POST /__echo` route doing `c.req.text()`
// reproduced the hang with no auth and an empty body — confirming the body
// stream from IncomingMessage is never delivered to Hono's Web-Request wrapper
// on this platform. Vercel's serverless Node functions don't pre-buffer `req`
// and the Web-stream wrapper inside `getRequestListener` waits indefinitely.
//
// FIX: build the Web `Request` ourselves. Drain `req` to a Buffer up front
// (Node Readable iteration works fine on Vercel — only the Web-Stream bridge
// is broken) and pass the Buffer as the `body` to `new Request(...)`. Then
// call `app.fetch(request)` and pipe the Web Response back to ServerResponse.
//
// Why dynamic imports + a boot-promise: ESM static imports execute at module
// load. If any of them throw (e.g. `apps/api/src/env.ts` rejecting a missing
// CLERK_SECRET_KEY in production), Vercel surfaces only an opaque
// FUNCTION_INVOCATION_FAILED 500 — no stack, no message. By deferring the
// imports inside an async IIFE and catching, we can return the actual
// `error.message` + a truncated stack in a JSON 500 body, so the failure is
// debuggable from a single curl.
//
// instrumentation MUST be the first dynamic import for OTel to patch
// http/pg before app.ts pulls them in. Order matters here.

import type { IncomingMessage, ServerResponse } from "node:http";

export const config = {
  runtime: "nodejs",
  // Hobby plan max is 60s; default is 10s. ONB-01 import does Firecrawl
  // (≤30s) + Browserbase screenshot (≤20s) in parallel and was hitting
  // FUNCTION_INVOCATION_TIMEOUT at 10s. 60s gives comfortable headroom.
  // If we ever cross this, move products.import to Trigger.dev (the same
  // pattern runDiscovery / runPositioning already use) so the dispatcher
  // stays under 1s and the heavy work runs in a worker.
  maxDuration: 60,
};

type FetchHandler = (request: Request) => Response | Promise<Response>;

let fetchHandler: FetchHandler | null = null;
let bootError: Error | null = null;

const bootPromise = (async () => {
  try {
    // Relative dynamic imports MUST carry the .js extension under Node's ESM
    // strict resolution. TypeScript with `moduleResolution: bundler` allows
    // the `.js` form to resolve to the `.ts` source. Without the extension,
    // runtime fails with `Cannot find module '/var/task/apps/api/src/...'`.
    await import("../src/instrumentation.js");
    const { app } = await import("../src/app.js");
    fetchHandler = app.fetch as FetchHandler;
  } catch (err) {
    bootError = err instanceof Error ? err : new Error(String(err));
    console.error(
      JSON.stringify({
        level: "error",
        source: "boot",
        message: "@launchwings/api failed to boot",
        error: bootError.message,
        stack: bootError.stack?.split("\n").slice(0, 12).join("\n"),
      }),
    );
  }
})();

// Drain a Node IncomingMessage into a single Buffer. We do this synchronously-
// upfront (before constructing the Web Request) because the `getRequestListener`
// path that hands the IncomingMessage stream to a Web ReadableStream wrapper
// hangs on Vercel's Node runtime — see file header.
async function readIncomingBody(req: IncomingMessage): Promise<Buffer> {
  if (req.method === "GET" || req.method === "HEAD") {
    return Buffer.alloc(0);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function buildWebHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

export default async function (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await bootPromise;
  if (bootError) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        message: "boot_failed",
        error: bootError.message,
        stack: bootError.stack?.split("\n").slice(0, 12),
      }),
    );
    return;
  }
  if (!fetchHandler) {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, message: "boot_in_progress" }));
    return;
  }

  try {
    const bodyBuffer = await readIncomingBody(req);
    const host = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost") as string;
    const proto = (req.headers["x-forwarded-proto"] ?? "https") as string;
    const url = `${proto}://${host}${req.url ?? "/"}`;
    const method = req.method ?? "GET";
    const init: RequestInit = {
      method,
      headers: buildWebHeaders(req),
    };
    if (method !== "GET" && method !== "HEAD" && bodyBuffer.length > 0) {
      // Pass the drained Buffer directly (Node's undici accepts Uint8Array
      // bodies). We avoid passing a ReadableStream because that's exactly the
      // path that hangs on Vercel.
      (init as RequestInit & { body: Uint8Array }).body = new Uint8Array(bodyBuffer);
      // Required when the body is a stream/Uint8Array and we want fetch's
      // duplex semantics — undici warns otherwise. Cast to `any` because the
      // RequestInit type in lib.dom doesn't yet declare `duplex`.
      (init as { duplex?: string }).duplex = "half";
    }
    const request = new Request(url, init);
    const response = await fetchHandler(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      // `set-cookie` may be repeated; Headers.forEach already iterates each
      // entry separately if appended multiple times so this is fine.
      res.setHeader(key, value);
    });
    if (response.body === null) {
      res.end();
      return;
    }
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 12).join("\n") : undefined;
    console.error(
      JSON.stringify({
        level: "error",
        source: "vercel-bridge",
        message: "request bridge threw",
        error: message,
        stack,
      }),
    );
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, message: "internal_error", error: message }));
    } else {
      res.end();
    }
  }
}
