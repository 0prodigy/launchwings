import { describe, expect, it } from "vitest";
import { extractPdfText, MAX_PDF_BYTES, PdfParseError } from "../pdf";

// We don't ship a fixture PDF in CI. The valuable surfaces to lock in are
// the typed-error shape and the magic-byte / size pre-checks; those run
// before unpdf is touched at all, which keeps these tests fast and
// runtime-agnostic.

describe("extractPdfText", () => {
  it("rejects an empty buffer", async () => {
    await expect(extractPdfText(Buffer.alloc(0))).rejects.toMatchObject({
      name: "PdfParseError",
      kind: "empty",
    });
  });

  it("rejects an oversize buffer without invoking pdfjs", async () => {
    const tooBig = Buffer.alloc(MAX_PDF_BYTES + 1, 0x25); // bytes never reach pdfjs
    const err = await extractPdfText(tooBig).catch((e) => e);
    expect(err).toBeInstanceOf(PdfParseError);
    expect(err.kind).toBe("too_large");
  });

  it("rejects a non-PDF buffer via magic-byte check", async () => {
    const html = Buffer.from("<!doctype html><html>not a pdf</html>", "utf8");
    const err = await extractPdfText(html).catch((e) => e);
    expect(err).toBeInstanceOf(PdfParseError);
    expect(err.kind).toBe("corrupt");
  });

  it("PdfParseError carries kind through instanceof", () => {
    const e = new PdfParseError("encrypted", "test");
    expect(e).toBeInstanceOf(Error);
    expect(e.kind).toBe("encrypted");
    expect(e.name).toBe("PdfParseError");
  });
});
