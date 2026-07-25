import { describe, expect, it, beforeEach } from "vitest";
import {
  domainAgeEvaluator,
  evaluateDomainAge,
  judgeDomainAge,
  _unsafeClearDomainAgeCache,
} from "../../evaluators/domain-age";

// domain-age tests. We never invoke the real `whois-json` module — every
// test passes an injected `whois` fn that returns a synthetic record.
// The cache is cleared between tests so successive cases don't share
// state.

beforeEach(() => {
  _unsafeClearDomainAgeCache();
});

const FIXED_NOW = new Date("2026-05-07T12:00:00.000Z");

function whoisReturning(record: Record<string, unknown>) {
  return async () => record;
}

describe("judgeDomainAge", () => {
  it("passes for >= 90 days", () => {
    expect(judgeDomainAge(90).severity).toBe("pass");
    expect(judgeDomainAge(365).severity).toBe("pass");
  });

  it("warns for 30..89 days", () => {
    expect(judgeDomainAge(30).severity).toBe("warn");
    expect(judgeDomainAge(89).severity).toBe("warn");
  });

  it("fails for < 30 days", () => {
    expect(judgeDomainAge(29).severity).toBe("fail");
    expect(judgeDomainAge(0).severity).toBe("fail");
  });
});

describe("evaluateDomainAge", () => {
  it("passes for an established domain (registered 2 years ago)", async () => {
    const out = await evaluateDomainAge("example.com", {
      whois: whoisReturning({
        creationDate: "2024-04-01T00:00:00Z",
        registrar: "MarkMonitor Inc.",
      }),
      now: () => FIXED_NOW,
    });
    expect(out.severity).toBe("pass");
    expect(out.evidence.creationDate).toBe("2024-04-01T00:00:00.000Z");
    expect(out.evidence.ageDays).toBeGreaterThan(365);
    expect(out.evidence.registrar).toBe("MarkMonitor Inc.");
  });

  it("warns for a domain registered 60 days ago", async () => {
    const sixtyDaysAgo = new Date(FIXED_NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
    const out = await evaluateDomainAge("brandnew.com", {
      whois: whoisReturning({ created: sixtyDaysAgo.toISOString(), registrar: "GoDaddy" }),
      now: () => FIXED_NOW,
    });
    expect(out.severity).toBe("warn");
    expect(out.evidence.ageDays).toBeGreaterThanOrEqual(59);
    expect(out.evidence.ageDays).toBeLessThanOrEqual(61);
  });

  it("fails for a domain registered yesterday (the launchwings.com baseline)", async () => {
    const yesterday = new Date(FIXED_NOW.getTime() - 24 * 60 * 60 * 1000);
    const out = await evaluateDomainAge("launchwings.com", {
      whois: whoisReturning({
        creationDate: yesterday.toISOString(),
        registrar: "GoDaddy",
      }),
      now: () => FIXED_NOW,
    });
    expect(out.severity).toBe("fail");
    expect(out.evidence.ageDays).toBeLessThan(30);
  });

  it("fails when WHOIS returns no parseable creation date", async () => {
    const out = await evaluateDomainAge("ghost-domain.com", {
      whois: whoisReturning({ registrar: "Unknown" }),
      now: () => FIXED_NOW,
    });
    expect(out.severity).toBe("fail");
    expect(out.evidence.creationDate).toBeNull();
    expect(out.evidence.ageDays).toBe(-1);
  });

  it("skips non-public hosts (localhost, 127.0.0.1, *.local) with skipped evidence", async () => {
    let whoisCalls = 0;
    const whois = async () => {
      whoisCalls += 1;
      return {};
    };
    for (const h of ["localhost", "127.0.0.1", "myapp.local"]) {
      const out = await evaluateDomainAge(h, { whois, now: () => FIXED_NOW });
      expect(out.severity).toBe("pass");
      expect(out.evidence.skipped).toBe("non-public-host");
    }
    expect(whoisCalls).toBe(0);
  });

  it("caches WHOIS results across calls within the TTL", async () => {
    let calls = 0;
    const whois = async () => {
      calls += 1;
      return { creationDate: "2024-01-01T00:00:00Z", registrar: "X" };
    };
    const a = await evaluateDomainAge("cached.com", { whois, now: () => FIXED_NOW });
    const b = await evaluateDomainAge("cached.com", { whois, now: () => FIXED_NOW });
    expect(calls).toBe(1);
    expect(a.evidence.fromCache).toBe(false);
    expect(b.evidence.fromCache).toBe(true);
  });

  it("re-fetches once the cache TTL expires", async () => {
    let calls = 0;
    const whois = async () => {
      calls += 1;
      return { creationDate: "2024-01-01T00:00:00Z" };
    };
    // Use a 1-ms TTL so the second call falls outside the window.
    await evaluateDomainAge("ttl.com", {
      whois,
      now: () => FIXED_NOW,
      cacheTtlMs: 1,
    });
    const t2 = new Date(FIXED_NOW.getTime() + 5);
    await evaluateDomainAge("ttl.com", {
      whois,
      now: () => t2,
      cacheTtlMs: 1,
    });
    expect(calls).toBe(2);
  });
});

describe("domainAgeEvaluator (top-level)", () => {
  it("synthesises a fail row on an invalid URL", async () => {
    const result = await domainAgeEvaluator.evaluate(
      { url: "::not::a::url" },
      { fetchHtml: async () => ({ html: "", finalUrl: "", status: 0 }), runId: "r", now: () => 0 },
    );
    expect(result.severity).toBe("fail");
    const ev = result.evidenceJson as Record<string, unknown>;
    expect(ev.error).toMatch(/Invalid target URL/);
  });
});
