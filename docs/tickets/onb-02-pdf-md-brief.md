# ONB-02 — PDF/MD brief upload + parse

> Spec: `docs/tickets/SPRINT_02.md` § ONB-02. Branch:
> `claude/solopreneur-launch-platform-JwOOq`.

## Acceptance (verbatim from SPRINT_02)

- Upload PDF (≤10MB) or paste markdown.
- PDF text extracted via PyMuPDF (or pdf-parse on Node).
- Text saved to `products.brief_text`.
- Image attachments (PDF embedded) saved to R2 and linked.

## Sub-tasks

- [ ] **Migration 0009**: add `brief_text text` and `brief_attachments
      jsonb NOT NULL DEFAULT '[]'::jsonb` to `products`. Stage only —
      founder applies.
- [ ] **Schema**: mirror columns in `packages/db/src/schema.ts`.
- [ ] **PDF text extractor** at `packages/agents/src/extractors/pdf.ts`
      using `pdf-parse@^2.4` (PDFParse class, ESM). Function
      `extractPdfText(buffer: Buffer): Promise<{ text, pageCount }>`.
      10MB hard cap, throws typed `PdfParseError` on overflow / corrupt
      input.
- [ ] **tRPC mutation** `products.uploadBrief` (protected):
      `{ kind: "markdown", text } | { kind: "pdf", base64 }`. Decoded
      buffer ≤ 10MB. Persists `brief_text` on the tenant's existing
      product (most recent) — if none, creates a stub with
      `name = "Untitled brief"`, `url = null`.
- [ ] **Test**: vitest covering markdown path (no pdf decode), and
      PDF buffer-too-large rejection. Skip live PDF parse in CI to
      avoid the @napi-rs/canvas binary in test runner.
- [ ] **Build/type-check** all four affected packages green.

## Non-scope (deferred to follow-up ticket
`onb-02-followup-r2-attachments.md`)

- **R2 image attachments**: introduces Cloudflare R2 bucket + creds + an
  S3 SDK. ONB-04 (Discovery Agent) depends only on text, so attachments
  don't block the wedge. Tracked separately so this ticket stays in
  its 2d budget.

## Founder follow-ups

- Apply migration 0009 against Neon prod.
- (No new env vars — pdf-parse is pure-JS in CI; @napi-rs/canvas is a
  transitive dep used only for `getScreenshot` which we don't call.)
