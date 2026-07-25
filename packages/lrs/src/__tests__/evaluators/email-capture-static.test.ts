import { describe, expect, it } from "vitest";
import { judgeEmailCaptureFromHtml } from "../../evaluators/email-capture-static";

describe("judgeEmailCaptureFromHtml", () => {
  it("passes when a form contains an email input", () => {
    const html = `<!doctype html><html><body>
      <form action="https://example.com/subscribe">
        <input type="email" name="email" />
        <button>Join</button>
      </form>
    </body></html>`;
    const r = judgeEmailCaptureFromHtml(html);
    expect(r.severity).toBe("pass");
    expect(r.evidence.kind).toBe("form");
    expect(r.evidence.destination).toBe("example.com");
  });

  it("passes when a known provider script is embedded", () => {
    const html = `<!doctype html><html><head>
      <script src="https://app.loops.so/embed.js"></script>
    </head></html>`;
    const r = judgeEmailCaptureFromHtml(html);
    expect(r.severity).toBe("pass");
    expect(r.evidence.kind).toBe("embed");
    expect(r.evidence.destination).toBe("loops.so");
  });

  it("fails when no form or known provider is present", () => {
    const html = `<!doctype html><html><body><p>No signup here.</p></body></html>`;
    const r = judgeEmailCaptureFromHtml(html);
    expect(r.severity).toBe("fail");
    expect(r.evidence.found).toBe(false);
  });
});
