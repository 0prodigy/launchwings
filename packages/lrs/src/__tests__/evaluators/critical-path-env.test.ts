import { describe, expect, it } from "vitest";
import {
  criticalPathEnvEvaluator,
  parseDeclaredEndpointsFromHtml,
  probeEndpoint,
  probeWaitlist,
  judgeCriticalPath,
  type DeclaredEndpoint,
} from "../../evaluators/critical-path-env";
import type { AuditContext, AuditTarget } from "../../types";

// Tests for LRS-CRITICAL-PATH-001 — declared-endpoint reachability +
// waitlist probe. All deterministic; fetch is mocked via a per-test
// fetchImpl so no real network is hit.

function fetchSeries(
  responses: Array<Response | { url?: string; status: number; body?: string; init?: ResponseInit }>,
): { fetchImpl: typeof fetch; calls: Array<{ url: string; method: string }> } {
  const calls: Array<{ url: string; method: string }> = [];
  let i = 0;
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method });
    const next = responses[i++];
    if (!next) throw new Error(`fetchSeries exhausted at call ${i}`);
    if (next instanceof Response) return next;
    return new Response(next.body ?? null, { status: next.status, ...next.init });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function makeCtx(): AuditContext {
  let t = 0;
  return {
    fetchHtml: async () => {
      throw new Error("fetchHtml should not be called when fetchedHtml is set");
    },
    runId: "11111111-1111-1111-1111-111111111111",
    now: () => t++,
  };
}

describe("parseDeclaredEndpointsFromHtml", () => {
  it("extracts <form action> + <button data-api-endpoint>", () => {
    const html = `<!doctype html><html><body>
      <form action="/api/waitlist"><input name="email"></form>
      <button data-api-endpoint="/api/health">ping</button>
    </body></html>`;
    const found = parseDeclaredEndpointsFromHtml(html, "https://example.com/");
    expect(found).toHaveLength(2);
    expect(found[0]).toEqual({
      source: "form-action",
      url: "https://example.com/api/waitlist",
    });
    expect(found[1]).toEqual({
      source: "button-data-api-endpoint",
      url: "https://example.com/api/health",
    });
  });

  it("dedupes identical declarations", () => {
    const html = `
      <form action="/api/waitlist"></form>
      <form action="/api/waitlist"></form>`;
    const found = parseDeclaredEndpointsFromHtml(html, "https://example.com/");
    expect(found).toHaveLength(1);
  });

  it("skips empty or relative-fail values", () => {
    const html = `<form action=""></form><button data-api-endpoint="://broken"></button>`;
    const found = parseDeclaredEndpointsFromHtml(html, "https://example.com/");
    // Empty action is skipped; "://broken" parses as a URL with no protocol
    // — the URL ctor accepts it relative to base, so we expect 1 entry.
    expect(found.length).toBeLessThanOrEqual(1);
  });
});

describe("probeEndpoint", () => {
  const endpoint: DeclaredEndpoint = {
    source: "form-action",
    url: "https://example.com/api/health",
  };

  it("classifies 200 / 204 / 405 as exists", async () => {
    for (const status of [200, 204, 405]) {
      const { fetchImpl } = fetchSeries([{ status }]);
      const result = await probeEndpoint(endpoint, { fetchImpl });
      expect(result.classification).toBe("exists");
      expect(result.status).toBe(status);
    }
  });

  it("classifies 404 as missing", async () => {
    const { fetchImpl } = fetchSeries([{ status: 404 }]);
    const result = await probeEndpoint(endpoint, { fetchImpl });
    expect(result.classification).toBe("missing");
  });

  it("classifies 5xx as server_error", async () => {
    const { fetchImpl } = fetchSeries([{ status: 502 }]);
    const result = await probeEndpoint(endpoint, { fetchImpl });
    expect(result.classification).toBe("server_error");
  });

  it("falls back to OPTIONS when HEAD throws at the network layer", async () => {
    let i = 0;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      i++;
      if (i === 1) throw new Error("HEAD blocked by origin");
      return new Response(null, { status: 405 });
    }) as typeof fetch;
    const result = await probeEndpoint(endpoint, { fetchImpl });
    expect(result.method).toBe("OPTIONS");
    expect(result.classification).toBe("exists");
  });
});

describe("probeWaitlist", () => {
  const endpoint: DeclaredEndpoint = {
    source: "form-action",
    url: "https://example.com/api/waitlist",
  };

  it("returns warn when 200 with {ok:true} (downstream send unverifiable)", async () => {
    const { fetchImpl, calls } = fetchSeries([
      {
        status: 200,
        body: JSON.stringify({ ok: true, message: "queued" }),
        init: { headers: { "content-type": "application/json" } },
      },
    ]);
    const result = await probeWaitlist(endpoint, "abc-run", { fetchImpl });
    expect(result.outcome).toBe("warn");
    expect(result.bodyOk).toBe(true);
    expect(calls[0]?.method).toBe("POST");
  });

  it("returns pass when non-2xx (route correctly surfacing failure)", async () => {
    const { fetchImpl } = fetchSeries([
      {
        status: 503,
        body: JSON.stringify({ ok: false, message: "Email service is not configured" }),
        init: { headers: { "content-type": "application/json" } },
      },
    ]);
    const result = await probeWaitlist(endpoint, "abc-run", { fetchImpl });
    expect(result.outcome).toBe("pass");
    expect(result.status).toBe(503);
  });

  it("returns pass when 2xx with {ok:false} (structured failure surfaced)", async () => {
    const { fetchImpl } = fetchSeries([
      {
        status: 200,
        body: JSON.stringify({ ok: false, message: "duplicate" }),
        init: { headers: { "content-type": "application/json" } },
      },
    ]);
    const result = await probeWaitlist(endpoint, "abc-run", { fetchImpl });
    expect(result.outcome).toBe("pass");
  });

  it("returns warn when 2xx with non-{ok:bool} shape", async () => {
    const { fetchImpl } = fetchSeries([{ status: 200, body: "OK" }]);
    const result = await probeWaitlist(endpoint, "abc-run", { fetchImpl });
    expect(result.outcome).toBe("warn");
  });
});

describe("judgeCriticalPath", () => {
  it("scores no-endpoints as a non-blocking pass", () => {
    const j = judgeCriticalPath({
      declaredEndpoints: [],
      endpointResults: [],
      waitlistResults: [],
    });
    expect(j.severity).toBe("pass");
    expect(j.score).toBeLessThan(100);
  });

  it("any 404 -> fail", () => {
    const ep: DeclaredEndpoint = { source: "form-action", url: "https://x.com/api/m" };
    const j = judgeCriticalPath({
      declaredEndpoints: [ep],
      endpointResults: [
        {
          endpoint: ep,
          method: "HEAD",
          status: 404,
          classification: "missing",
          isWaitlistShape: false,
        },
      ],
      waitlistResults: [],
    });
    expect(j.severity).toBe("fail");
  });

  it("any 5xx -> warn", () => {
    const ep: DeclaredEndpoint = { source: "form-action", url: "https://x.com/api/m" };
    const j = judgeCriticalPath({
      declaredEndpoints: [ep],
      endpointResults: [
        {
          endpoint: ep,
          method: "HEAD",
          status: 502,
          classification: "server_error",
          isWaitlistShape: false,
        },
      ],
      waitlistResults: [],
    });
    expect(j.severity).toBe("warn");
  });
});

describe("criticalPathEnvEvaluator (integration)", () => {
  // The evaluator runs HEAD on each endpoint and POST against waitlist-shape
  // ones. We verify the four canonical cases the spec calls out.

  const baseUrl = "https://example.com/";

  function ctxWithFetch(fetchImpl: typeof fetch): AuditContext {
    return { ...makeCtx(), fetchHtml: async () => ({ html: "", finalUrl: baseUrl, status: 200 }) };
  }

  it("endpoint exists (HEAD 405) — pass", async () => {
    const html = `<form action="/api/health"></form>`;
    const target: AuditTarget = { url: baseUrl, fetchedHtml: html };
    const { fetchImpl } = fetchSeries([{ status: 405 }]);
    // Patch global fetch for this test (probeEndpoint defaults to global).
    const origFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fetchImpl;
    try {
      const result = await criticalPathEnvEvaluator.evaluate(target, ctxWithFetch(fetchImpl));
      expect(result.severity).toBe("pass");
      const ev = result.evidenceJson as Record<string, unknown>;
      const eps = ev.endpointResults as Array<Record<string, unknown>>;
      expect(eps).toHaveLength(1);
      expect(eps[0]?.classification).toBe("exists");
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = origFetch;
    }
  });

  it("endpoint 404 — fail", async () => {
    const html = `<form action="/api/missing"></form>`;
    const target: AuditTarget = { url: baseUrl, fetchedHtml: html };
    const { fetchImpl } = fetchSeries([{ status: 404 }]);
    const origFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fetchImpl;
    try {
      const result = await criticalPathEnvEvaluator.evaluate(target, ctxWithFetch(fetchImpl));
      expect(result.severity).toBe("fail");
      expect(result.fixActionMarkdown).toMatch(/404|don't exist/i);
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = origFetch;
    }
  });

  it("endpoint 5xx — warn", async () => {
    const html = `<form action="/api/health"></form>`;
    const target: AuditTarget = { url: baseUrl, fetchedHtml: html };
    const { fetchImpl } = fetchSeries([{ status: 503 }]);
    const origFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fetchImpl;
    try {
      const result = await criticalPathEnvEvaluator.evaluate(target, ctxWithFetch(fetchImpl));
      expect(result.severity).toBe("warn");
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = origFetch;
    }
  });

  it("waitlist 502 on POST — pass (route surfaces failure correctly)", async () => {
    // First call: HEAD on /api/waitlist → 405 (exists). Second: POST → 502.
    const html = `<form action="/api/waitlist"></form>`;
    const target: AuditTarget = { url: baseUrl, fetchedHtml: html };
    const { fetchImpl, calls } = fetchSeries([
      { status: 405 },
      { status: 502, body: JSON.stringify({ ok: false, message: "bad gateway" }) },
    ]);
    const origFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fetchImpl;
    try {
      const result = await criticalPathEnvEvaluator.evaluate(target, ctxWithFetch(fetchImpl));
      expect(result.severity).toBe("pass");
      expect(calls[0]?.method).toBe("HEAD");
      expect(calls[1]?.method).toBe("POST");
      const ev = result.evidenceJson as Record<string, unknown>;
      const wl = ev.waitlistResults as Array<Record<string, unknown>>;
      expect(wl).toHaveLength(1);
      expect(wl[0]?.outcome).toBe("pass");
      expect(wl[0]?.status).toBe(502);
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = origFetch;
    }
  });
});
