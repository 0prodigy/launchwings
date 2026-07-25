import { createHash } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  extractPdfText,
  PdfParseError,
  MAX_PDF_BYTES,
  discoveryAgent,
  positioningAgent,
  importProductTask,
  auditTarget,
} from "@launchwings/agents";
import { dbPool, products, withTenant } from "@launchwings/db";
import { protectedProcedure, router } from "../trpc";
import { renderPrivacyPolicy } from "../generators/privacy-policy";
import { renderPosthogSnippet } from "../generators/posthog-snippet";

// Stable 8-char prefix of sha1(notes ?? "") for idempotency-key composition.
// Keep a re-fire with the SAME notes (including no notes at all) deduped by
// Trigger.dev, but allow a re-fire with NEW notes to spawn a fresh run. The
// hash is collision-resistant enough at 8 hex chars for this scope (per-
// product, per-tenant key namespace already constrains the universe).
function shortNotesHash(notes: string | undefined | null): string {
  return createHash("sha1").update(notes ?? "").digest("hex").slice(0, 8);
}

// ONB-01 (migration) — URL importer dispatcher.
//
// Originally `products.import` ran Firecrawl + Browserbase synchronously
// inside this mutation, but real customer URLs (e.g. launchwings.com) blow
// past Vercel's 60s function ceiling even with maxDuration: 60. The fix is
// to dispatch the work to Trigger.dev and let the founder UI poll
// products.get for `metadata.extracted` to land.
//
// Flow:
//   1. Insert a stub products row (metadata: {}, name = hostname, url set).
//   2. Trigger importProductTask with idempotencyKey "import:<tenant>:<productId>"
//      so a refresh-spamming founder can't enqueue dupes.
//   3. Return { productId, triggerRunId, status: "queued" }.
// The task itself owns Firecrawl + Browserbase + build-platform detection
// inside the agents worker (see packages/agents/src/tasks/import-product.ts).

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ─── ONB-03: GitHub repo connect ────────────────────────────────────────────
//
// GitHub OAuth is provisioned through Clerk: founders connect GitHub as an
// external account on their Clerk profile. We never persist the token; we
// fetch it on demand via `clerk.users.getUserOauthAccessToken(...)` and use it
// to read README + package.json + first /docs markdown, then hand off to the
// existing URL importer (ONB-01) when a deployed URL is detectable.

const GH_API = "https://api.github.com";
const GH_HEADERS_BASE = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "launchwings/1.0",
} as const;

function ghHeaders(token: string): Record<string, string> {
  return { ...GH_HEADERS_BASE, Authorization: `Bearer ${token}` };
}

// Tiny per-clerkUserId TTL cache for listGithubRepos. Separate from the
// users-table cache in apps/api/src/middleware/clerk.ts on purpose — different
// invalidation semantics, different keyspace.
type RepoListEntry = { at: number; data: GithubRepoSummary[] };
const repoListCache = new Map<string, RepoListEntry>();
const REPO_LIST_TTL_MS = 60_000;

export type GithubRepoSummary = {
  owner: string;
  repo: string;
  defaultBranch: string;
  private: boolean;
  description: string | null;
  homepage: string | null;
  htmlUrl: string;
};

// Resolve the OAuth GitHub token for the caller via Clerk. Throws CONFLICT
// when the founder hasn't connected GitHub yet (no `oauth_github` external
// account on the Clerk profile, or the SDK returned an empty list).
async function getGithubTokenFromClerk(clerkUserId: string): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Clerk is not configured on this server (CLERK_SECRET_KEY missing). GitHub repo import requires Clerk OAuth.",
    });
  }
  const clerk = createClerkClient({ secretKey: secret });
  let resp;
  try {
    resp = await clerk.users.getUserOauthAccessToken(clerkUserId, "oauth_github");
  } catch (err) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Connect GitHub from your account settings to import a repo. (Clerk could not return a GitHub OAuth token.)",
      cause: err,
    });
  }
  // Clerk Backend SDK returns { data: ExternalAccount[], totalCount }.
  // Each entry has .token + .provider.
  const list = resp?.data ?? [];
  const first = list[0];
  if (!first?.token) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Connect GitHub from your account settings to import a repo",
    });
  }
  return first.token;
}

// Map a GitHub-side fetch failure to a clear TRPCError. 401 → reconnect; 403 →
// scopes or rate-limit (echo X-RateLimit-Remaining when present).
function mapGithubError(res: Response, body: string | null): TRPCError {
  if (res.status === 401) {
    return new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "GitHub rejected the OAuth token. Reconnect GitHub from your account settings (scopes: read:user, public_repo).",
    });
  }
  if (res.status === 403) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      const reset = res.headers.get("x-ratelimit-reset");
      return new TRPCError({
        code: "FORBIDDEN",
        message: `GitHub rate limit hit (remaining=0${reset ? `, resets at ${reset}` : ""}). Try again shortly.`,
      });
    }
    return new TRPCError({
      code: "FORBIDDEN",
      message:
        "GitHub OAuth scopes insufficient — reconnect with read:user + public_repo from your account settings.",
    });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `GitHub API error (${res.status}): ${body?.slice(0, 200) ?? "<no body>"}`,
  });
}

// ───── pickDeployUrl ────────────────────────────────────────────────────────
// Precedence:
//   1. package.json `homepage` (URL-shaped)
//   2. GitHub repo `homepage` field (URL-shaped)
//   3. README first https URL that is NOT github.com / shields.io / a badge
//   4. null
// Exported for unit testing.
const NON_DEPLOY_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "raw.githubusercontent.com",
  "img.shields.io",
  "shields.io",
  "badge.fury.io",
  "codecov.io",
  "circleci.com",
  "travis-ci.org",
  "travis-ci.com",
]);

function isHttpUrl(input: unknown): input is string {
  if (typeof input !== "string") return false;
  try {
    const u = new URL(input);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function pickDeployUrl(args: {
  repoHomepage: string | null;
  packageJsonHomepage: unknown;
  readmeText: string | null;
}): string | null {
  if (isHttpUrl(args.packageJsonHomepage)) return args.packageJsonHomepage;
  if (isHttpUrl(args.repoHomepage)) return args.repoHomepage;
  if (args.readmeText) {
    // Pull http(s) URLs out of the README. We don't try to be clever about
    // markdown link syntax — a regex over raw text catches `[label](url)`,
    // `<url>`, and bare URLs alike.
    const matches = args.readmeText.match(/https?:\/\/[^\s)\]>"']+/g) ?? [];
    for (const raw of matches) {
      // Strip trailing punctuation that often follows inline links.
      const cleaned = raw.replace(/[.,;:!?]+$/, "");
      try {
        const u = new URL(cleaned);
        if (NON_DEPLOY_HOSTS.has(u.hostname)) continue;
        // Reject obvious non-deploy patterns: anything that looks like an
        // image asset is almost certainly a badge. We accept only URLs that
        // either have no path or a non-image extension.
        const path = u.pathname.toLowerCase();
        if (/\.(svg|png|jpg|jpeg|gif|webp)$/.test(path)) continue;
        return u.toString();
      } catch {
        // Fall through to next candidate.
      }
    }
  }
  return null;
}

// Decode a base64-encoded `content` field from a GitHub /contents response.
function decodeGhContent(content: string | null | undefined): string | null {
  if (!content) return null;
  try {
    return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
  } catch {
    return null;
  }
}

export const productsRouter = router({
  // ONB-06 Slice B — read a single product row scoped to the caller's tenant.
  // Used by the onboarding UI to poll for `metadata.discovery` and
  // `metadata.positioning` after the agents merge results back. Mirrors the
  // shape in agentsRouter.getAuditRun (NOT_FOUND on miss, RLS belt-and-braces
  // via withTenant).
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = dbPool();
      return withTenant(db, ctx.tenantId, async (tx) => {
        const rows = await tx
          .select()
          .from(products)
          .where(eq(products.id, input.id));
        const product = rows[0];
        if (!product) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `product ${input.id} not found in this tenant`,
          });
        }
        return { product };
      });
    }),

  // ONB-06 Slice B — list this tenant's products, newest first. Used by the
  // brief-upload flow to find the most-recent product (uploadBrief's
  // find-or-create target) so we can dispatch Discovery against the right
  // productId. Limit 20 covers the dashboard "existing products" use case.
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const db = dbPool();
    return withTenant(db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(products)
        .orderBy(desc(products.createdAt))
        .limit(20);
      return { products: rows };
    });
  }),

  // T5 — projected-shape sibling of listMine for the dashboard sidebar /
  // project switcher. `listMine` returns full rows (callers like uploadBrief
  // depend on briefText / metadata being present); the dashboard only needs
  // a thin projection plus a derived `status` flag. Kept as a separate proc
  // so the existing callers don't need to change.
  //
  // Status derivation:
  //   metadata.import_error present → "error"
  //   metadata.extracted absent     → "importing"
  //   else                          → "ready"
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = dbPool();
    return withTenant(db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(products)
        .orderBy(desc(products.createdAt))
        .limit(50);
      const projected = rows.map((row) => {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        const status: "importing" | "ready" | "error" =
          meta.import_error !== undefined && meta.import_error !== null
            ? "error"
            : meta.extracted === undefined || meta.extracted === null
              ? "importing"
              : "ready";
        return {
          id: row.id,
          name: row.name,
          url: row.url,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          status,
        };
      });
      return { products: projected };
    });
  }),

  import: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      // FIRECRAWL_API_KEY / BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID are
      // consumed inside the importProductTask worker, NOT here. The
      // dispatcher only needs Trigger.dev to be configured.
      if (!process.env.TRIGGER_SECRET_KEY) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "agents runtime not configured: set TRIGGER_SECRET_KEY in apps/api environment (see SETUP-04 founder follow-ups)",
        });
      }

      // 1) Insert the stub row inside the caller's tenant scope. The task
      //    will read this row by id and update its metadata.
      const productName = safeHostname(input.url);
      const db = dbPool();
      const productId = await withTenant(db, ctx.tenantId, async (tx) => {
        const inserted = await tx
          .insert(products)
          .values({
            tenantId: ctx.tenantId,
            name: productName,
            url: input.url,
            metadata: {},
          })
          .returning({ id: products.id });
        const row = inserted[0];
        if (!row) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "products insert returned no row",
          });
        }
        return row.id;
      });

      // 2) Dispatch the Trigger.dev task. Idempotency key keeps a
      //    refresh-spamming founder from enqueueing duplicate runs against
      //    the same stub row.
      const handle = await importProductTask.trigger(
        {
          tenantId: ctx.tenantId,
          productId,
          url: input.url,
        },
        { idempotencyKey: `import:${ctx.tenantId}:${productId}` },
      );

      return {
        productId,
        triggerRunId: handle.id,
        status: "queued" as const,
      };
    }),

  // ONB-02 — PDF/MD brief upload. Updates the tenant's most-recent product's
  // brief_text, or creates a stub product if none exists. R2 image attachments
  // are deferred to a follow-up ticket; brief_attachments stays `[]`.
  uploadBrief: protectedProcedure
    .input(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("markdown"),
          text: z.string().min(1).max(200_000),
        }),
        z.object({
          kind: z.literal("pdf"),
          // base64-encoded PDF; 10MB raw → ~13.4MB base64. Cap at 14MB
          // characters as a cheap upstream rejection before we decode.
          base64: z.string().min(1).max(14 * 1024 * 1024),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      let briefText: string;
      let pageCount: number | null = null;

      if (input.kind === "markdown") {
        briefText = input.text.trim();
      } else {
        let buffer: Buffer;
        try {
          buffer = Buffer.from(input.base64, "base64");
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "pdf base64 payload is not valid base64",
          });
        }
        if (buffer.length > MAX_PDF_BYTES) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `decoded PDF exceeds ${MAX_PDF_BYTES} bytes`,
          });
        }
        try {
          const parsed = await extractPdfText(buffer);
          briefText = parsed.text;
          pageCount = parsed.pageCount;
        } catch (err) {
          if (err instanceof PdfParseError) {
            const code =
              err.kind === "too_large" || err.kind === "empty" || err.kind === "corrupt" || err.kind === "encrypted"
                ? "BAD_REQUEST"
                : "INTERNAL_SERVER_ERROR";
            throw new TRPCError({ code, message: err.message });
          }
          throw err;
        }
        if (briefText.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "PDF parsed but contained no extractable text (scanned image?)",
          });
        }
      }

      const db = dbPool();
      const result = await withTenant(db, ctx.tenantId, async (tx) => {
        // Pick the tenant's most-recent product to attach the brief to. If
        // none exists yet (founder skipped ONB-01), create a stub so the
        // downstream Discovery Agent has a row to read from.
        const existing = await tx
          .select()
          .from(products)
          .orderBy(desc(products.createdAt))
          .limit(1);

        if (existing[0]) {
          const updated = await tx
            .update(products)
            .set({ briefText, updatedAt: new Date() })
            .returning();
          const row = updated[0];
          if (!row) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "products update returned no row",
            });
          }
          return row;
        }

        const inserted = await tx
          .insert(products)
          .values({
            tenantId: ctx.tenantId,
            name: "Untitled brief",
            url: null,
            briefText,
          })
          .returning();
        const row = inserted[0];
        if (!row) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "products insert returned no row",
          });
        }
        return row;
      });

      return {
        product: result,
        kind: input.kind,
        pageCount,
      };
    }),

  // ONB-04 — kick off the Discovery Agent for a product. The agent reads the
  // product row, runs Sonnet 4.6, and merges the structured brief into
  // `products.metadata.discovery`. We dispatch via Trigger.dev so the founder
  // UI can poll progress through the agent_runs row keyed on the trigger run
  // id (see agentsRouter.getAuditRun for the equivalent pattern).
  runDiscovery: protectedProcedure
    .input(
      z.object({
        productId: z.string().uuid(),
        // T5 — optional founder follow-up notes (regenerate UI). Threaded
        // through to the Discovery payload schema and into the prompt body
        // by buildDiscoveryUserMessage when non-empty.
        notes: z.string().max(4000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!process.env.TRIGGER_SECRET_KEY) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "agents runtime not configured: set TRIGGER_SECRET_KEY in apps/api environment (see SETUP-04 founder follow-ups)",
        });
      }
      // T5 — idempotency mirrors the import-product pattern. Same product +
      // same notes content → Trigger.dev dedupes the re-fire; new notes
      // produce a different hash and therefore a fresh run.
      const idempotencyKey = `discovery:${ctx.tenantId}:${input.productId}:${shortNotesHash(input.notes)}`;
      const handle = await discoveryAgent.trigger(
        {
          tenantId: ctx.tenantId,
          productId: input.productId,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
        { idempotencyKey },
      );
      return {
        triggerRunId: handle.id,
        agent: "discovery" as const,
      };
    }),

  // ONB-05 — kick off the Positioning Agent for a product. Reads
  // `metadata.discovery` (lands from runDiscovery) and merges
  // `metadata.positioning` on success. The agent throws PositioningInputError
  // when discovery is missing; that surfaces via the agent_runs row, not the
  // tRPC mutation (dispatch is fire-and-forget — same shape as runDiscovery).
  runPositioning: protectedProcedure
    .input(
      z.object({
        productId: z.string().uuid(),
        // T5 — optional founder follow-up notes (regenerate UI).
        notes: z.string().max(4000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!process.env.TRIGGER_SECRET_KEY) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "agents runtime not configured: set TRIGGER_SECRET_KEY in apps/api environment (see SETUP-04 founder follow-ups)",
        });
      }
      // T5 — see runDiscovery comment; same idempotency contract.
      const idempotencyKey = `positioning:${ctx.tenantId}:${input.productId}:${shortNotesHash(input.notes)}`;
      const handle = await positioningAgent.trigger(
        {
          tenantId: ctx.tenantId,
          productId: input.productId,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
        { idempotencyKey },
      );
      return {
        triggerRunId: handle.id,
        agent: "positioning" as const,
      };
    }),

  // T5 — approveBrief.
  //
  // The founder reviews the Discovery + Positioning agent output in T3's
  // brief editor, edits inline, and clicks "approve". This proc:
  //   1. Validates tenant ownership of the product (RLS + explicit tenant
  //      scope via withTenant).
  //   2. Merges the founder's edits over the agent output in
  //      metadata.discovery.output / metadata.positioning.output (founder
  //      wins; agent output is preserved underneath via spread).
  //   3. Stamps metadata.brief = { approvedAt, approvedBy } so the UI can
  //      gate downstream stages on "is the brief locked?".
  //   4. Dispatches the existing Stage 1 LRS audit (auditTarget) when the
  //      product has a URL. auditTarget takes { url }, not { productId };
  //      the product-level wiring (productId → lrs_runs) is a follow-up.
  //
  // Note on the returned `lrsRunId`: auditTarget creates the lrs_runs row
  // INSIDE the trigger.dev task body (see agentsRouter.runAudit); we don't
  // know the lrs_runs.id at dispatch time. We return null here and the
  // client polls getAuditRun once the trigger run completes — same pattern
  // as agentsRouter.runAudit. This is intentional, not a "deferred" hole.
  approveBrief: protectedProcedure
    .input(
      z.object({
        productId: z.string().uuid(),
        brief: z.object({
          discovery: z.record(z.unknown()),
          positioning: z.record(z.unknown()),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = dbPool();
      const { productId } = input;

      const { product, approvedAt } = await withTenant(
        db,
        ctx.tenantId,
        async (tx) => {
          const rows = await tx
            .select()
            .from(products)
            .where(eq(products.id, productId));
          const existing = rows[0];
          if (!existing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `product ${productId} not found in this tenant`,
            });
          }

          const currentMetadata = (existing.metadata ?? {}) as Record<string, unknown>;
          const currentDiscovery = (currentMetadata.discovery ?? {}) as Record<string, unknown>;
          const currentDiscoveryOutput = (currentDiscovery.output ?? {}) as Record<string, unknown>;
          const currentPositioning = (currentMetadata.positioning ?? {}) as Record<string, unknown>;
          const currentPositioningOutput = (currentPositioning.output ?? {}) as Record<string, unknown>;

          const stamp = new Date().toISOString();
          const nextMetadata: Record<string, unknown> = {
            ...currentMetadata,
            discovery: {
              ...currentDiscovery,
              output: { ...currentDiscoveryOutput, ...input.brief.discovery },
            },
            positioning: {
              ...currentPositioning,
              output: { ...currentPositioningOutput, ...input.brief.positioning },
            },
            brief: {
              approvedAt: stamp,
              approvedBy: ctx.userId,
            },
          };

          const updated = await tx
            .update(products)
            .set({ metadata: nextMetadata, updatedAt: new Date() })
            .where(eq(products.id, productId))
            .returning();
          const row = updated[0];
          if (!row) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "products update returned no row",
            });
          }
          return { product: row, approvedAt: stamp };
        },
      );

      // Dispatch the LRC-02 Stage 1 audit. auditTarget takes a URL; if the
      // founder uploaded a brief without ever importing a URL, skip the
      // dispatch — the brief is still locked, but there's nothing to audit.
      let triggerRunId: string | null = null;
      let audit: "dispatched" | "skipped_no_url" | "skipped_no_runtime" = "skipped_no_runtime";
      if (!process.env.TRIGGER_SECRET_KEY) {
        audit = "skipped_no_runtime";
      } else if (!product.url) {
        audit = "skipped_no_url";
      } else {
        const handle = await auditTarget.trigger({
          tenantId: ctx.tenantId,
          url: product.url,
        });
        triggerRunId = handle.id;
        audit = "dispatched";
      }

      return {
        productId,
        approvedAt,
        triggerRunId,
        // The Stage 1 LRS run id is created INSIDE the auditTarget task body
        // and isn't available at dispatch time. The client polls
        // agentsRouter.getAuditRun (or a productId-scoped equivalent) once
        // the trigger run completes to read lrs_runs.id.
        lrsRunId: null as string | null,
        audit,
      };
    }),

  // ─── ONB-03 procs ─────────────────────────────────────────────────────
  //
  // We don't widen `protectedProcedure` to require clerkUserId — the X-Test
  // dev escape hatch sets it to null, and that path legitimately can't reach
  // GitHub. Each proc checks at the top and surfaces CONFLICT with a clear
  // "connect GitHub" CTA, which doubles as the "no oauth_github account on
  // your Clerk profile" message.

  // Connection status — the UI uses this to decide whether to render the
  // "Connect GitHub" empty-state or the repo list. `login` is the GitHub
  // username (read off `GET /user`) — null when not connected.
  getGithubConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.clerkUserId) return { connected: false, login: null };
    let token: string;
    try {
      token = await getGithubTokenFromClerk(ctx.clerkUserId);
    } catch (err) {
      // Surface "not connected" as a structured payload, not an error — the
      // UI distinguishes "connected:false" (render CTA) from genuine failures.
      if (err instanceof TRPCError && err.code === "CONFLICT") {
        return { connected: false, login: null };
      }
      throw err;
    }
    const res = await fetch(`${GH_API}/user`, { headers: ghHeaders(token) });
    if (!res.ok) {
      // Token resolved but GitHub still rejected — surface the real error.
      throw mapGithubError(res, await res.text().catch(() => null));
    }
    const body = (await res.json()) as { login?: string };
    return { connected: true, login: body.login ?? null };
  }),

  // List the caller's first 30 repos (sorted by updated). 60s in-process
  // cache keyed on clerkUserId. Pagination beyond 30 is deferred.
  listGithubRepos: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.clerkUserId) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Connect GitHub from your account settings to import a repo",
      });
    }
    const cached = repoListCache.get(ctx.clerkUserId);
    if (cached && Date.now() - cached.at < REPO_LIST_TTL_MS) {
      return { repos: cached.data };
    }
    const token = await getGithubTokenFromClerk(ctx.clerkUserId);
    const res = await fetch(
      `${GH_API}/user/repos?sort=updated&per_page=30&affiliation=owner,collaborator`,
      { headers: ghHeaders(token) },
    );
    if (!res.ok) {
      throw mapGithubError(res, await res.text().catch(() => null));
    }
    type GhRepo = {
      name: string;
      owner: { login: string };
      default_branch: string;
      private: boolean;
      description: string | null;
      homepage: string | null;
      html_url: string;
    };
    const list = (await res.json()) as GhRepo[];
    const data: GithubRepoSummary[] = list.map((r) => ({
      owner: r.owner.login,
      repo: r.name,
      defaultBranch: r.default_branch,
      private: r.private,
      description: r.description,
      homepage: r.homepage,
      htmlUrl: r.html_url,
    }));
    repoListCache.set(ctx.clerkUserId, { at: Date.now(), data });
    return { repos: data };
  }),

  // Pull README + package.json + first /docs markdown for a repo, detect a
  // deploy URL via pickDeployUrl, and either dispatch importProductTask
  // against that URL (mirroring products.import) or fall back to seeding
  // briefText from the README so Discovery has something to read.
  importFromGithub: protectedProcedure
    .input(z.object({ owner: z.string().min(1), repo: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.clerkUserId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Connect GitHub from your account settings to import a repo",
        });
      }
      const token = await getGithubTokenFromClerk(ctx.clerkUserId);
      const headers = ghHeaders(token);
      const { owner, repo } = input;

      // Repo metadata first — we need default_branch + homepage.
      const metaRes = await fetch(`${GH_API}/repos/${owner}/${repo}`, { headers });
      if (!metaRes.ok) {
        throw mapGithubError(metaRes, await metaRes.text().catch(() => null));
      }
      const repoMeta = (await metaRes.json()) as {
        default_branch: string;
        homepage: string | null;
        description: string | null;
        html_url: string;
      };

      // Parallel fan-out for README, package.json, /docs listing.
      const [readmeSettled, pkgSettled, docsSettled] = await Promise.allSettled([
        fetch(`${GH_API}/repos/${owner}/${repo}/readme`, { headers }),
        fetch(`${GH_API}/repos/${owner}/${repo}/contents/package.json`, { headers }),
        fetch(`${GH_API}/repos/${owner}/${repo}/contents/docs`, { headers }),
      ]);

      // README: 404 is acceptable (some repos have none). Other non-OK statuses
      // are tolerated too — README absence shouldn't block import.
      let readmeText: string | null = null;
      if (readmeSettled.status === "fulfilled" && readmeSettled.value.ok) {
        const j = (await readmeSettled.value.json()) as { content?: string };
        readmeText = decodeGhContent(j.content);
      }

      // package.json: 404 acceptable.
      let packageJson: Record<string, unknown> | null = null;
      if (pkgSettled.status === "fulfilled" && pkgSettled.value.ok) {
        const j = (await pkgSettled.value.json()) as { content?: string };
        const decoded = decodeGhContent(j.content);
        if (decoded) {
          try {
            packageJson = JSON.parse(decoded) as Record<string, unknown>;
          } catch {
            packageJson = null;
          }
        }
      }

      // /docs: pick the first *.md file alphabetically and fetch its raw text.
      let firstDocText: string | null = null;
      if (docsSettled.status === "fulfilled" && docsSettled.value.ok) {
        const items = (await docsSettled.value.json()) as Array<{
          name: string;
          type: string;
          download_url: string | null;
        }>;
        const md = items
          .filter((it) => it.type === "file" && /\.md$/i.test(it.name))
          .sort((a, b) => a.name.localeCompare(b.name))[0];
        if (md?.download_url) {
          const r = await fetch(md.download_url, { headers });
          if (r.ok) {
            firstDocText = await r.text().catch(() => null);
          }
        }
      }

      const deployUrl = pickDeployUrl({
        repoHomepage: repoMeta.homepage,
        packageJsonHomepage: packageJson?.homepage,
        readmeText,
      });

      // Build the brief text fallback. Prefer the README; if absent, use the
      // first /docs markdown. Truncate to 50KB so we don't blow up the products
      // row on monorepos with massive READMEs.
      const fallbackBriefSource = readmeText ?? firstDocText ?? "";
      const briefText = fallbackBriefSource.slice(0, 50_000) || null;

      // Insert a stub products row inside the tenant scope (mirrors
      // products.import). When we have a deploy URL we set products.url so the
      // importProductTask has a target; otherwise leave url null and seed
      // briefText so Discovery can still run.
      const productName = `${owner}/${repo}`;
      const db = dbPool();
      const productId = await withTenant(db, ctx.tenantId, async (tx) => {
        const inserted = await tx
          .insert(products)
          .values({
            tenantId: ctx.tenantId,
            name: productName,
            url: deployUrl,
            briefText,
            metadata: {
              github: {
                owner,
                repo,
                defaultBranch: repoMeta.default_branch,
                htmlUrl: repoMeta.html_url,
                description: repoMeta.description,
              },
            },
          })
          .returning({ id: products.id });
        const row = inserted[0];
        if (!row) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "products insert returned no row",
          });
        }
        return row.id;
      });

      // Dispatch the URL importer when (a) we found a deploy URL AND (b) the
      // Trigger.dev runtime is configured. Otherwise the founder's brief flow
      // proceeds against the README-seeded briefText.
      let triggerRunId: string | null = null;
      let dispatched = false;
      if (deployUrl && process.env.TRIGGER_SECRET_KEY) {
        // Idempotency: include productId so a re-import (which mints a new
        // products row) doesn't collide with a prior run handle bound to the
        // old row. Same shape as products.import.
        const handle = await importProductTask.trigger(
          {
            tenantId: ctx.tenantId,
            productId,
            url: deployUrl,
          },
          { idempotencyKey: `import:github:${ctx.tenantId}:${productId}` },
        );
        triggerRunId = handle.id;
        dispatched = true;
      }

      return {
        productId,
        deployUrlFound: deployUrl !== null,
        deployUrl,
        dispatched,
        triggerRunId,
      };
    }),

  // ─── LRC-04 — Fix-with-AI generators ──────────────────────────────────────
  //
  // Both procs are sync: the generator is a pure function (no LLM, no
  // network), so we render → merge into products.metadata.generated_artifacts
  // → return the artifact in one round trip. Storage shape:
  //
  //   metadata.generated_artifacts.privacy_policy = {
  //     markdown, generatedAt, source: "lrs-fix",
  //     evaluatorId: "stage1-legal-links", inputs: {...}
  //   }
  //   metadata.generated_artifacts.posthog_snippet = {
  //     snippet, projectKey, host, generatedAt,
  //     source: "lrs-fix", evaluatorId: "dogfood-LRS-11"
  //   }
  //
  // Spread-merge at top-level AND into generated_artifacts so we don't clobber
  // sibling artifacts (e.g. running posthog gen must not erase a prior privacy
  // policy artifact, or vice versa).

  generatePrivacyPolicy: protectedProcedure
    .input(
      z.object({
        productId: z.string().uuid(),
        orgName: z.string().min(1).max(120),
        contactEmail: z.string().email(),
        jurisdiction: z.enum(["US", "EU", "UK", "Other"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = dbPool();
      return withTenant(db, ctx.tenantId, async (tx) => {
        const rows = await tx
          .select()
          .from(products)
          .where(eq(products.id, input.productId));
        const existing = rows[0];
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `product ${input.productId} not found in this tenant`,
          });
        }

        const { markdown } = renderPrivacyPolicy({
          orgName: input.orgName,
          contactEmail: input.contactEmail,
          jurisdiction: input.jurisdiction,
          productName: existing.name,
          productUrl: existing.url,
        });

        const generatedAt = new Date().toISOString();
        const currentMetadata = (existing.metadata ?? {}) as Record<string, unknown>;
        const currentArtifacts = (currentMetadata.generated_artifacts ?? {}) as Record<
          string,
          unknown
        >;
        const nextMetadata: Record<string, unknown> = {
          ...currentMetadata,
          generated_artifacts: {
            ...currentArtifacts,
            privacy_policy: {
              markdown,
              generatedAt,
              source: "lrs-fix",
              evaluatorId: "stage1-legal-links",
              inputs: {
                orgName: input.orgName,
                contactEmail: input.contactEmail,
                jurisdiction: input.jurisdiction,
              },
            },
          },
        };

        await tx
          .update(products)
          .set({ metadata: nextMetadata, updatedAt: new Date() })
          .where(eq(products.id, input.productId));

        return { artifact: { markdown, generatedAt } };
      });
    }),

  generatePosthogSnippet: protectedProcedure
    .input(
      z.object({
        productId: z.string().uuid(),
        // Defence-in-depth: the generator re-validates this regex too. Keep
        // both — the proc validation gives a structured zod error to the UI;
        // the generator throw is a safety net for any future caller.
        projectKey: z.string().regex(/^phc_[A-Za-z0-9]{20,}$/),
        host: z.enum(["us", "eu"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = dbPool();
      return withTenant(db, ctx.tenantId, async (tx) => {
        const rows = await tx
          .select()
          .from(products)
          .where(eq(products.id, input.productId));
        const existing = rows[0];
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `product ${input.productId} not found in this tenant`,
          });
        }

        const { snippet } = renderPosthogSnippet({
          projectKey: input.projectKey,
          host: input.host,
        });

        const generatedAt = new Date().toISOString();
        const currentMetadata = (existing.metadata ?? {}) as Record<string, unknown>;
        const currentArtifacts = (currentMetadata.generated_artifacts ?? {}) as Record<
          string,
          unknown
        >;
        const nextMetadata: Record<string, unknown> = {
          ...currentMetadata,
          generated_artifacts: {
            ...currentArtifacts,
            posthog_snippet: {
              snippet,
              projectKey: input.projectKey,
              host: input.host,
              generatedAt,
              source: "lrs-fix",
              evaluatorId: "dogfood-LRS-11",
            },
          },
        };

        await tx
          .update(products)
          .set({ metadata: nextMetadata, updatedAt: new Date() })
          .where(eq(products.id, input.productId));

        return { artifact: { snippet, generatedAt } };
      });
    }),
});
