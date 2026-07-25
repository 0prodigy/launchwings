"use client";

// ONB-06 Slice B — onboarding entry. A signed-in founder either pastes a URL
// (Firecrawl + Browserbase synchronous import) or uploads a markdown / PDF
// brief, and we dispatch Discovery → Positioning agents in the background,
// polling `products.get` until both `metadata.discovery` and
// `metadata.positioning` land. Slice C owns the brief editor at
// /app/[productId]/brief.

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

type Tab = "url" | "brief" | "github";

type ImportErrorStage = "firecrawl" | "browserbase";

type ProductMetadata = {
  extracted?: {
    title?: string | null;
    metaDescription?: string | null;
    heroHeadline?: string | null;
    primaryCta?: { text?: string | null; href?: string | null } | null;
  };
  screenshot?: { pngBase64?: string };
  import_error?: {
    stage?: ImportErrorStage;
    message?: string;
    kind?: string;
  };
  discovery?: unknown;
  positioning?: unknown;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader returned non-string"));
        return;
      }
      // Strip the `data:application/pdf;base64,` prefix — server expects raw
      // base64 (see uploadBrief input schema in packages/trpc).
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

export default function AppHomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [discoveryDispatched, setDiscoveryDispatched] = useState(false);
  const [positioningDispatched, setPositioningDispatched] = useState(false);
  const [completed, setCompleted] = useState(false);

  const importMutation = trpc.products.import.useMutation();
  const uploadBriefMutation = trpc.products.uploadBrief.useMutation();
  const listMine = trpc.products.listMine.useQuery(undefined, { enabled: false });
  const runDiscovery = trpc.products.runDiscovery.useMutation();
  const runPositioning = trpc.products.runPositioning.useMutation();
  // ONB-03 — GitHub repo connect. Connection status drives the empty-state
  // CTA vs. repo list; listGithubRepos is gated on `connected: true` so we
  // don't 409 spam the user when they haven't connected yet.
  const githubStatus = trpc.products.getGithubConnectionStatus.useQuery(undefined, {
    enabled: tab === "github",
  });
  const githubRepos = trpc.products.listGithubRepos.useQuery(undefined, {
    enabled: tab === "github" && githubStatus.data?.connected === true,
  });
  const importFromGithub = trpc.products.importFromGithub.useMutation();

  // Poll the active product until metadata.discovery and metadata.positioning
  // both land. We stop the interval once both are present (or `completed`),
  // which prevents wasted requests after redirect.
  const productQuery = trpc.products.get.useQuery(
    { id: activeProductId ?? "" },
    {
      enabled: Boolean(activeProductId) && !completed,
      refetchInterval: completed ? false : 3000,
    },
  );

  const product = productQuery.data?.product;
  const metadata = (product?.metadata ?? {}) as ProductMetadata;
  const hasExtracted = metadata.extracted != null;
  const hasImportError = metadata.import_error != null;
  const importErrorStage = metadata.import_error?.stage;
  const hasDiscovery = metadata.discovery != null;
  const hasPositioning = metadata.positioning != null;

  // Once import lands (`metadata.extracted` is present), kick off Discovery.
  // The brief-upload path bypasses this gate by calling startBriefFlow which
  // sets `discoveryDispatched=true` directly — products created from a brief
  // never have `metadata.extracted`.
  useEffect(() => {
    if (
      activeProductId &&
      hasExtracted &&
      !discoveryDispatched &&
      !runDiscovery.isPending
    ) {
      setDiscoveryDispatched(true);
      runDiscovery.mutate({ productId: activeProductId });
    }
  }, [activeProductId, hasExtracted, discoveryDispatched, runDiscovery]);

  // Once discovery lands, fire positioning exactly once.
  useEffect(() => {
    if (
      activeProductId &&
      hasDiscovery &&
      !positioningDispatched &&
      !runPositioning.isPending
    ) {
      setPositioningDispatched(true);
      runPositioning.mutate({ productId: activeProductId });
    }
  }, [activeProductId, hasDiscovery, positioningDispatched, runPositioning]);

  // Both agents complete → flip `completed` to halt polling and render the
  // ready card with a link to the brief editor (Slice C target).
  useEffect(() => {
    if (hasDiscovery && hasPositioning && !completed) {
      setCompleted(true);
    }
  }, [hasDiscovery, hasPositioning, completed]);

  // Brief-upload entry: no URL import to wait on, so we go straight to
  // Discovery. The URL flow now goes through trackImportedProduct which gates
  // Discovery on metadata.extracted (set by importProductTask).
  function startBriefFlow(productId: string) {
    setActiveProductId(productId);
    setDiscoveryDispatched(true);
    setPositioningDispatched(false);
    setCompleted(false);
    runDiscovery.mutate({ productId });
  }

  // URL flow: just set the active product. The polling effect picks up
  // `metadata.extracted` once importProductTask finishes and dispatches
  // Discovery. The mutation now returns a stub productId immediately.
  function trackImportedProduct(productId: string) {
    setActiveProductId(productId);
    setDiscoveryDispatched(false);
    setPositioningDispatched(false);
    setCompleted(false);
  }

  async function onSubmitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    const result = await importMutation.mutateAsync({ url });
    trackImportedProduct(result.productId);
  }

  async function onSubmitMarkdown(e: React.FormEvent) {
    e.preventDefault();
    if (!markdown.trim()) return;
    await uploadBriefMutation.mutateAsync({ kind: "markdown", text: markdown });
    const list = await listMine.refetch();
    const recent = list.data?.products[0];
    if (recent) startBriefFlow(recent.id);
  }

  async function onImportRepo(owner: string, repo: string) {
    const result = await importFromGithub.mutateAsync({ owner, repo });
    // dispatched=true means importProductTask is running against a deploy URL
    // — go through the same polling path as the URL tab. dispatched=false
    // means we created the product with briefText only; jump straight to
    // Discovery via startBriefFlow (no metadata.extracted ever lands).
    if (result.dispatched) {
      trackImportedProduct(result.productId);
    } else {
      startBriefFlow(result.productId);
    }
  }

  async function onPickPdf(file: File) {
    if (file.type === "text/markdown" || /\.(md|markdown)$/i.test(file.name)) {
      const text = await file.text();
      await uploadBriefMutation.mutateAsync({ kind: "markdown", text });
    } else {
      const base64 = await fileToBase64(file);
      await uploadBriefMutation.mutateAsync({ kind: "pdf", base64 });
    }
    const list = await listMine.refetch();
    const recent = list.data?.products[0];
    if (recent) startBriefFlow(recent.id);
  }

  const importErr = importMutation.error;
  const briefErr = uploadBriefMutation.error;
  const discoveryErr = runDiscovery.error;
  const positioningErr = runPositioning.error;
  const githubReposErr = githubRepos.error;
  const githubImportErr = importFromGithub.error;

  return (
    <main className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">LaunchWings</h1>
        <UserButton afterSignOutUrl="/" />
      </header>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="text-2xl font-semibold">Tell us about your product</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste your live URL, or drop in a brief. We&apos;ll run Discovery and
          Positioning agents in the background.
        </p>

        {!activeProductId && (
          <>
            <div className="mt-6 inline-flex rounded-lg border border-border bg-card p-1 gap-0.5">
              <button
                type="button"
                onClick={() => setTab("url")}
                className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                  tab === "url"
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Paste URL
              </button>
              <button
                type="button"
                onClick={() => setTab("brief")}
                className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                  tab === "brief"
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Upload brief
              </button>
              <button
                type="button"
                onClick={() => setTab("github")}
                className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                  tab === "github"
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Import from GitHub
              </button>
            </div>

            {tab === "github" ? (
              <div className="mt-6 space-y-4">
                {githubStatus.isLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Checking GitHub connection…
                  </p>
                ) : githubStatus.data?.connected ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Connected as{" "}
                      <span className="font-medium text-foreground">
                        {githubStatus.data.login ?? "GitHub user"}
                      </span>
                      . Pick a repo to import.
                    </p>
                    {githubRepos.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading repos…</p>
                    ) : githubRepos.data ? (
                      <ul className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
                        {githubRepos.data.repos.map((r) => (
                          <li
                            key={`${r.owner}/${r.repo}`}
                            className="flex items-center justify-between gap-4 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {r.owner}/{r.repo}
                                {r.private ? (
                                  <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
                                    private
                                  </span>
                                ) : null}
                              </p>
                              {r.description ? (
                                <p className="truncate text-xs text-muted-foreground">
                                  {r.description}
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => void onImportRepo(r.owner, r.repo)}
                              disabled={importFromGithub.isPending}
                              className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                              {importFromGithub.isPending ? "Importing…" : "Import"}
                            </button>
                          </li>
                        ))}
                        {githubRepos.data.repos.length === 0 ? (
                          <li className="px-4 py-3 text-sm text-muted-foreground">
                            No repos found on this account.
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-lg border border-border bg-card p-5">
                    <p className="text-sm font-semibold text-foreground">Connect GitHub to import a repo</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      We&apos;ll read your README, detect a deployed URL, and run
                      Discovery — no token storage on our side.
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Open the user menu (top right) → Connect account → GitHub.
                      Then return to this tab.
                    </p>
                    <button
                      type="button"
                      onClick={() => void githubStatus.refetch()}
                      className="mt-3 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
                    >
                      I&apos;ve connected — refresh
                    </button>
                  </div>
                )}
              </div>
            ) : tab === "url" ? (
              <form onSubmit={onSubmitUrl} className="mt-6 flex gap-2">
                <input
                  type="url"
                  required
                  placeholder="https://yourproduct.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={importMutation.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {importMutation.isPending ? "Importing…" : "Import"}
                </button>
              </form>
            ) : (
              <div className="mt-6 space-y-4">
                <form onSubmit={onSubmitMarkdown} className="space-y-2">
                  <label className="block text-sm font-medium">
                    Paste markdown
                  </label>
                  <textarea
                    rows={8}
                    placeholder="# My product&#10;What it does, who it's for…"
                    value={markdown}
                    onChange={(e) => setMarkdown(e.target.value)}
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="submit"
                    disabled={uploadBriefMutation.isPending || !markdown.trim()}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {uploadBriefMutation.isPending ? "Uploading…" : "Upload markdown"}
                  </button>
                </form>
                <div className="border-t border-border pt-4">
                  <label className="block text-sm font-medium">Or upload a file</label>
                  <input
                    type="file"
                    accept=".pdf,.md,.markdown,text/markdown,application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onPickPdf(f);
                    }}
                    className="mt-2 block text-sm"
                    disabled={uploadBriefMutation.isPending}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Errors — surface tRPC error messages verbatim. PRECONDITION_FAILED
            is what the founder sees when FIRECRAWL/BROWSERBASE/TRIGGER keys
            aren't set on apps/api. */}
        {importErr ? (
          <ErrorCard
            title={
              importErr.data?.code === "PRECONDITION_FAILED"
                ? "Agents runtime not configured"
                : "Import dispatch failed"
            }
            message={importErr.message}
          />
        ) : null}
        {briefErr ? <ErrorCard title="Brief upload failed" message={briefErr.message} /> : null}
        {discoveryErr ? (
          <ErrorCard
            title={
              discoveryErr.data?.code === "PRECONDITION_FAILED"
                ? "Agents runtime not configured"
                : "Discovery dispatch failed"
            }
            message={discoveryErr.message}
          />
        ) : null}
        {positioningErr ? (
          <ErrorCard title="Positioning dispatch failed" message={positioningErr.message} />
        ) : null}
        {githubReposErr ? (
          <ErrorCard
            title={
              githubReposErr.data?.code === "CONFLICT"
                ? "Connect GitHub to continue"
                : githubReposErr.data?.code === "UNAUTHORIZED" ||
                    githubReposErr.data?.code === "FORBIDDEN"
                  ? "GitHub rejected the request"
                  : "Couldn't list GitHub repos"
            }
            message={githubReposErr.message}
          />
        ) : null}
        {githubImportErr ? (
          <ErrorCard
            title={
              githubImportErr.data?.code === "CONFLICT"
                ? "Connect GitHub to continue"
                : "GitHub import failed"
            }
            message={githubImportErr.message}
          />
        ) : null}

        {/* URL flow: importer is queued and we're waiting on metadata.extracted
            to land. Shows once activeProductId is set but Firecrawl hasn't
            written the extracted block yet. Suppressed for the brief flow
            (no URL to import). */}
        {activeProductId && product?.url && !hasExtracted && !hasImportError ? (
          <div className="mt-8 rounded-lg border border-border bg-card p-5">
            <p className="text-sm font-semibold text-foreground">Importing site…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Crawling {product.url} and capturing a screenshot. This usually takes
              15–45 seconds.
            </p>
          </div>
        ) : null}

        {/* Import_error from importProductTask. The task writes import_error
            with stage="firecrawl" (hard fail) or stage="browserbase" (soft —
            we still got the page text, just no screenshot). */}
        {hasImportError && importErrorStage === "firecrawl" ? (
          <ErrorCard
            title="Couldn't read this site"
            message="It may be behind a login, Cloudflare, or rendered only in JavaScript. Try the brief tab instead."
          />
        ) : null}
        {hasImportError && importErrorStage === "browserbase" ? (
          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-amber-400">
              Couldn&apos;t capture a screenshot
            </p>
            <p className="mt-1 text-sm text-amber-300/80">
              The page text was read fine, so we&apos;re continuing without a
              screenshot.
            </p>
          </div>
        ) : null}

        {/* Import evidence — shows what Firecrawl + Browserbase pulled. */}
        {product?.url && metadata.extracted ? (
          <div className="mt-8 rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Imported from {product.url}</h3>
            <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Title</dt>
                <dd className="text-sm text-foreground mt-0.5">{metadata.extracted.title ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Hero headline</dt>
                <dd className="text-sm text-foreground mt-0.5">{metadata.extracted.heroHeadline ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Primary CTA</dt>
                <dd className="text-sm text-foreground mt-0.5">{metadata.extracted.primaryCta?.text ?? "—"}</dd>
              </div>
            </dl>
            {metadata.screenshot?.pngBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${metadata.screenshot.pngBase64}`}
                alt="Homepage screenshot"
                className="mt-4 w-full rounded-md border border-border"
              />
            ) : null}
          </div>
        ) : null}

        {/* Agent progress. Polling halts once `completed` flips to true. */}
        {discoveryDispatched && !completed ? (
          <div className="mt-8 rounded-lg border border-border bg-card p-5">
            <p className="text-sm font-semibold text-foreground">
              {hasDiscovery
                ? "Positioning agent is running…"
                : "Discovery agent is running…"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Polling every 3s. This usually takes 30–60 seconds per agent.
            </p>
            <ul className="mt-4 flex flex-col gap-1.5 text-sm text-muted-foreground">
              <li>Discovery: {hasDiscovery ? "ready" : "running…"}</li>
              <li>
                Positioning:{" "}
                {hasPositioning
                  ? "ready"
                  : positioningDispatched
                    ? "running…"
                    : "queued"}
              </li>
            </ul>
          </div>
        ) : null}

        {completed && activeProductId ? (
          <div className="mt-8 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5">
            <p className="text-sm font-semibold text-emerald-400">
              Discovery + Positioning ready — open brief editor
            </p>
            <div className="mt-3">
              <Link
                href={`/app/${activeProductId}/brief`}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Open brief
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
      <p className="text-sm font-semibold text-red-400">{title}</p>
      <p className="mt-1 text-sm text-red-300/80">{message}</p>
    </div>
  );
}
