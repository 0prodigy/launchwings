import { NextResponse } from "next/server";
import { z } from "zod";
import { loadRunById } from "@/lib/audit-persist";
import { isDbConfigured } from "@/lib/db-optional";

// LRC-01 PR6 — public read of a previously persisted anonymous audit.
//
// Caching: results are immutable once written. We set an hour of public
// caching so Vercel's edge can serve subsequent shares cheaply. No CDN
// invalidation story is needed — the row never changes.
//
// 404 vs 503 semantics:
//   - DATABASE_URL unset → 503 (the permalink feature is unavailable in this
//     deploy; the marketing site without DB still works for live audits).
//   - runId not found → 404.
//   - bad runId shape → 400.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RunIdSchema = z.string().uuid();

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await ctx.params;
  const parsed = RunIdSchema.safeParse(runId);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "runId must be a uuid" },
      { status: 400 },
    );
  }
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Audit permalinks are not configured in this deploy." },
      { status: 503 },
    );
  }
  const payload = await loadRunById(parsed.data);
  if (!payload) {
    return NextResponse.json(
      { ok: false, message: "No audit found for that id." },
      { status: 404 },
    );
  }
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
