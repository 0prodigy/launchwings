import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be hoisted-friendly (vi.mock is hoisted by vitest).
const sessionsCreate = vi.fn();
const cdpSend = vi.fn();
const newCDPSession = vi.fn();
const setViewportSize = vi.fn();
const pageGoto = vi.fn();
const browserClose = vi.fn();
const newContext = vi.fn();
const newPage = vi.fn();

const fakePage = {
  setViewportSize: (size: { width: number; height: number }) => setViewportSize(size),
  goto: (url: string, opts?: unknown) => pageGoto(url, opts),
};

const fakeCtx = {
  pages: () => [fakePage],
  newPage: () => newPage(),
  newCDPSession: (p: unknown) => newCDPSession(p),
};

const fakeBrowser = {
  contexts: () => [fakeCtx],
  newContext: () => newContext(),
  close: () => browserClose(),
};

vi.mock("@browserbasehq/sdk", () => {
  return {
    default: class {
      sessions = { create: (args: unknown) => sessionsCreate(args) };
      constructor(_opts: unknown) {}
    },
  };
});

vi.mock("playwright-core", () => {
  return {
    chromium: {
      connectOverCDP: vi.fn(async (_url: string) => fakeBrowser),
    },
  };
});

beforeEach(() => {
  sessionsCreate.mockReset();
  cdpSend.mockReset();
  newCDPSession.mockReset();
  setViewportSize.mockReset();
  pageGoto.mockReset();
  browserClose.mockReset();
  newContext.mockReset();
  newPage.mockReset();

  sessionsCreate.mockResolvedValue({ id: "sess_123", connectUrl: "wss://example.invalid/sess" });
  newCDPSession.mockResolvedValue({ send: (m: string, p: unknown) => cdpSend(m, p) });
  cdpSend.mockResolvedValue({ data: "BASE64PNGDATA" });
  pageGoto.mockResolvedValue(undefined);
});

describe("screenshotHomepage", () => {
  it("uses CDP Page.captureScreenshot with png + captureBeyondViewport and closes the browser", async () => {
    const { screenshotHomepage } = await import("../clients/browserbase");
    const out = await screenshotHomepage("https://example.com", {
      apiKey: "k",
      projectId: "p",
    });
    expect(out.pngBase64).toBe("BASE64PNGDATA");
    expect(out.viewport).toEqual({ width: 1280, height: 800 });

    expect(sessionsCreate).toHaveBeenCalledWith({ projectId: "p" });
    expect(setViewportSize).toHaveBeenCalledWith({ width: 1280, height: 800 });
    expect(pageGoto).toHaveBeenCalledWith("https://example.com", { waitUntil: "load" });
    expect(cdpSend).toHaveBeenCalledTimes(1);
    const [method, params] = cdpSend.mock.calls[0]!;
    expect(method).toBe("Page.captureScreenshot");
    expect(params).toMatchObject({ format: "png", captureBeyondViewport: true });
    expect(params).not.toHaveProperty("quality");
    expect(browserClose).toHaveBeenCalledTimes(1);
  });

  it("maps a 429 from session.create to BrowserbaseError(rate_limited) and never opens a browser", async () => {
    const err = Object.assign(new Error("Too Many Requests"), { status: 429 });
    sessionsCreate.mockRejectedValueOnce(err);
    const { screenshotHomepage, BrowserbaseError } = await import("../clients/browserbase");
    const caught = await screenshotHomepage("https://example.com", {
      apiKey: "k",
      projectId: "p",
    }).catch((e) => e);
    expect(caught).toBeInstanceOf(BrowserbaseError);
    expect(caught.kind).toBe("rate_limited");
    expect(caught.status).toBe(429);
    expect(browserClose).not.toHaveBeenCalled();
  });

  it("maps a navigation net::ERR_NAME_NOT_RESOLVED to not_found and closes the browser", async () => {
    pageGoto.mockRejectedValueOnce(new Error("page.goto: net::ERR_NAME_NOT_RESOLVED at https://nope"));
    const { screenshotHomepage } = await import("../clients/browserbase");
    await expect(
      screenshotHomepage("https://nope.invalid", { apiKey: "k", projectId: "p" }),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(browserClose).toHaveBeenCalledTimes(1);
  });
});
