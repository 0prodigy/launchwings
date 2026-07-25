## DOGFOOD-LRS-01 — Multi-region latency probe for Stage 1 item 1

**Intent**: replace single-region `curl` with a 3+ region probe so we can honestly evaluate the "p95 < 2s from 3 regions" gate, both for our own site and for every customer's audit.

**Acceptance**:
- LRS Audit Agent (`packages/agents/lrs-audit/`) ships a `latencyProbe` evaluator that issues parallel HTTP HEAD requests from at least 3 distinct egress points: `us-east-1`, `eu-west-1`, `ap-south-1` (chosen because they cover the three big traffic concentrations and our own `bom1` POP).
- Egress mechanism: Cloudflare Workers (`fetch` from a Worker pinned to a specific colo via `cf.colo` hint) OR Lambda@Edge OR a hosted multi-region prober (e.g. UpDown.io / Checkly free tier) — pick the cheapest that gives reliable colo selection.
- Report shape: `{region: string, status: number, latency_ms: {p50, p95, p99}}[]` with `n=5` samples per region.
- Verdict: fail if any region p95 > 2000ms OR status ≠ 2xx.
- Live verification: run against `https://launchwings.com` and attach the JSON to `docs/dogfood/LRS_AUDIT_LOG.md` cycle 2.

**Estimate**: 2d. **Owner**: AI eng. **Deps**: `LRC-02` (LRS Audit Agent skeleton).
