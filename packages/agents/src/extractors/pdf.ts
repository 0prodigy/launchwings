// ONB-02 — PDF text extraction.
//
// Uses unpdf — Mozilla pdf.js bundled for serverless (worker inlined,
// DOMMatrix/FinalizationRegistry polyfilled). pdf-parse@2's transitive
// pdfjs-dist@5 references DOMMatrix at module-load time and crashes Vercel
// Functions cold-start; unpdf's serverless build avoids that.
// Docs: https://github.com/unjs/unpdf#readme

import { extractText, getDocumentProxy } from "unpdf";

// 10MB hard cap from the SPRINT_02 ONB-02 acceptance. Founder UI also
// rejects > 10MB before reaching the API; this is the server-side
// belt-and-braces.
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export type PdfParseErrorKind =
  | "too_large"
  | "empty"
  | "corrupt"
  | "encrypted"
  | "unknown";

export class PdfParseError extends Error {
  readonly kind: PdfParseErrorKind;
  constructor(kind: PdfParseErrorKind, message: string) {
    super(message);
    this.name = "PdfParseError";
    this.kind = kind;
  }
}

export type PdfExtractResult = {
  text: string;
  pageCount: number;
};

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  if (!buffer || buffer.length === 0) {
    throw new PdfParseError("empty", "PDF buffer is empty");
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw new PdfParseError(
      "too_large",
      `PDF exceeds ${MAX_PDF_BYTES} bytes (got ${buffer.length})`,
    );
  }

  // Cheap magic-byte check before handing to pdfjs — saves a noisy stack
  // trace when a non-PDF (e.g. an HTML error page or a docx) gets through.
  const header = buffer.subarray(0, 4).toString("ascii");
  if (header !== "%PDF") {
    throw new PdfParseError("corrupt", "buffer does not start with %PDF");
  }

  try {
    // Note: pdfjs is finicky about Buffer vs Uint8Array — pass a fresh
    // Uint8Array view even though Buffer extends it.
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    return {
      text: (text ?? "").trim(),
      pageCount: totalPages ?? 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password|encrypted/i.test(msg)) {
      throw new PdfParseError("encrypted", `PDF is password-protected: ${msg}`);
    }
    if (/invalid pdf|corrupt|missing pdf|stream must have/i.test(msg)) {
      throw new PdfParseError("corrupt", `unpdf failed to parse: ${msg}`);
    }
    throw new PdfParseError("unknown", `unpdf failed: ${msg}`);
  }
}
