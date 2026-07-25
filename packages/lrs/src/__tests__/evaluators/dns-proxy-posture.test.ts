import { describe, expect, it } from "vitest";
import {
  dnsProxyPostureEvaluator,
  evaluateDnsProxyPosture,
  isCloudflareIp,
  type DnsProbeDeps,
} from "../../evaluators/dns-proxy-posture";

// DNS evaluator tests. We never touch the real `dns.promises` — every
// test injects a `DnsProbeDeps` shim that returns precomputed
// resolve4 / resolve6 / resolveCname results based on the FQDN.

function buildDeps(table: {
  cname?: Record<string, string[]>;
  v4?: Record<string, string[]>;
  v6?: Record<string, string[]>;
}): DnsProbeDeps {
  return {
    resolveCname: async (host) => table.cname?.[host] ?? [],
    resolve4: async (host) => table.v4?.[host] ?? [],
    resolve6: async (host) => table.v6?.[host] ?? [],
  };
}

describe("isCloudflareIp", () => {
  it("matches the published Cloudflare v4 ranges", () => {
    expect(isCloudflareIp("104.21.5.10")).toBe(true); // 104.21.0.0/16
    expect(isCloudflareIp("172.67.42.1")).toBe(true); // 172.67.0.0/16
    expect(isCloudflareIp("104.16.132.7")).toBe(true); // 104.16.0.0/12
    expect(isCloudflareIp("172.64.10.10")).toBe(true); // 172.64.0.0/13
  });

  it("matches the published Cloudflare v6 prefix", () => {
    expect(isCloudflareIp("2606:4700:3035::abcd")).toBe(true);
    expect(isCloudflareIp("2606:4701:0::1")).toBe(false);
  });

  it("rejects Vercel's documented edge IP (76.76.21.21)", () => {
    expect(isCloudflareIp("76.76.21.21")).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(isCloudflareIp("not-an-ip")).toBe(false);
    expect(isCloudflareIp("999.999.999.999")).toBe(false);
  });
});

describe("evaluateDnsProxyPosture", () => {
  it("passes when apex+www point at non-Cloudflare IPs (Vercel direct)", async () => {
    const deps = buildDeps({
      v4: {
        "example.com": ["76.76.21.21"],
        "www.example.com": ["76.76.21.21"],
      },
      cname: {
        "www.example.com": ["cname.vercel-dns.com"],
      },
    });
    const out = await evaluateDnsProxyPosture("www.example.com", deps);
    expect(out.severity).toBe("pass");
    expect(out.evidence.vercelBehindCloudflare).toBe(0);
    expect(out.evidence.underscoreRecordsOnCloudflare).toBe(0);
  });

  it("fails when a Vercel CNAME resolves through Cloudflare edge IPs (the launchwings.com 1016 trap)", async () => {
    const deps = buildDeps({
      cname: {
        "www.launchwings.com": ["cname.vercel-dns.com"],
      },
      v4: {
        "www.launchwings.com": ["104.21.5.10"], // CF edge
      },
      v6: {
        "www.launchwings.com": ["2606:4700:3035::dead:beef"],
      },
    });
    const out = await evaluateDnsProxyPosture("www.launchwings.com", deps);
    expect(out.severity).toBe("fail");
    expect(out.evidence.vercelBehindCloudflare).toBeGreaterThan(0);
    const problematic = out.evidence.records.filter((r) => r.isProblematic);
    expect(problematic.length).toBeGreaterThan(0);
    expect(problematic[0]?.reason).toMatch(/cloudflare/i);
    expect(out.fixActionMarkdown).toMatch(/dash\.cloudflare/i);
  });

  it("warns on an underscore-prefixed record proxied through Cloudflare", async () => {
    const deps = buildDeps({
      v4: {
        "example.com": ["76.76.21.21"],
        "www.example.com": ["76.76.21.21"],
        // _domainconnect imported from a GoDaddy NS migration (per learning #9)
        "_domainconnect.example.com": ["104.21.10.10"],
      },
    });
    const out = await evaluateDnsProxyPosture("example.com", deps);
    expect(out.severity).toBe("warn");
    expect(out.evidence.underscoreRecordsOnCloudflare).toBe(1);
  });

  it("does not flag Cloudflare-edge IPs when no vendor CNAME is present (origin is allowed to be Cloudflare-fronted)", async () => {
    const deps = buildDeps({
      v4: {
        "example.com": ["104.21.99.99"], // CF, but no vercel/netlify CNAME
        "www.example.com": ["104.21.99.99"],
      },
    });
    const out = await evaluateDnsProxyPosture("example.com", deps);
    expect(out.severity).toBe("pass");
  });
});

describe("dnsProxyPostureEvaluator (top-level evaluator shape)", () => {
  it("synthesises a fail row on an invalid URL", async () => {
    const result = await dnsProxyPostureEvaluator.evaluate(
      { url: "not a url" },
      { fetchHtml: async () => ({ html: "", finalUrl: "", status: 0 }), runId: "r", now: () => 0 },
    );
    expect(result.severity).toBe("fail");
    const ev = result.evidenceJson as Record<string, unknown>;
    expect(ev.error).toMatch(/Invalid target URL/);
  });
});
