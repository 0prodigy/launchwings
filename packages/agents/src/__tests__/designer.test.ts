import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPollinationsUrl,
  designerPayloadSchema,
  runDesignerAgent,
  type AgentHelpers,
} from "../index";

// Tests for the designer (generateHeroImage) Trigger task.
//
// No LLM call here — the task hits Pollinations directly. Cassette-replay is
// overkill; we mock global fetch at the boundary and assert:
//
//   1. URL composition: encodeURIComponent on the prompt; numeric params raw.
//   2. Payload schema: defaults applied for omitted seed/width/height.
//   3. Result shape: returns url, imageBytes, prompt, seed, width, height,
//      and echoes savePathHint when provided.
//   4. Defensive failure modes: non-2xx, wrong content-type, too-small
//      response — all bubble up as Errors so defineAgent persists status="failed".

const TENANT = "00000000-0000-0000-0000-000000000000";

function makeHelpers(): { helpers: AgentHelpers; logged: Record<string, unknown>[] } {
  const logged: Record<string, unknown>[] = [];
  const helpers: AgentHelpers = {
    llm: async () => {
      throw new Error("designer should not call llm");
    },
    logEvent: (line) => {
      logged.push(line);
    },
  };
  return { helpers, logged };
}

function fakeImageBuffer(bytes: number): ArrayBuffer {
  // Deterministic PNG-ish bytes; the task validates content-type from headers
  // and size from the buffer length, so the actual content is irrelevant.
  return new Uint8Array(bytes).fill(0x42).buffer;
}

function mockFetchOk(opts: { contentType?: string; bytes?: number; finalUrl?: string }): void {
  const buf = fakeImageBuffer(opts.bytes ?? 60 * 1024);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      return new Response(buf, {
        status: 200,
        headers: { "content-type": opts.contentType ?? "image/png" },
      }) as unknown as Response;
      // Note: opts.finalUrl is unused — Response's `url` is read-only and
      // empty in undici. The task falls back to the request URL when
      // response.url is empty, which is exactly what we assert below.
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildPollinationsUrl", () => {
  it("URL-encodes the prompt and includes width/height/seed/nologo", () => {
    const url = buildPollinationsUrl({
      prompt: "a cat & dog: friends",
      seed: 7042,
      width: 1600,
      height: 900,
    });
    expect(url).toContain("https://image.pollinations.ai/prompt/");
    // Encoded: spaces → %20, & → %26, : → %3A
    expect(url).toContain("a%20cat%20%26%20dog%3A%20friends");
    expect(url).toContain("width=1600");
    expect(url).toContain("height=900");
    expect(url).toContain("nologo=true");
    expect(url).toContain("seed=7042");
  });

  it("does not URL-encode the numeric query params", () => {
    const url = buildPollinationsUrl({ prompt: "x", seed: 1, width: 64, height: 64 });
    expect(url).toMatch(/\?width=64&height=64&nologo=true&seed=1$/);
  });
});

describe("designerPayloadSchema", () => {
  it("requires tenantId and prompt", () => {
    expect(() => designerPayloadSchema.parse({})).toThrow();
    expect(() => designerPayloadSchema.parse({ tenantId: TENANT })).toThrow();
  });

  it("accepts a minimal payload (tenantId + prompt)", () => {
    const parsed = designerPayloadSchema.parse({ tenantId: TENANT, prompt: "hello" });
    expect(parsed.prompt).toBe("hello");
    // seed/width/height are optional — defaults are applied in runDesignerAgent.
    expect(parsed.seed).toBeUndefined();
  });
});

describe("runDesignerAgent", () => {
  it("fetches the image and returns a shape with defaulted seed/width/height", async () => {
    mockFetchOk({ contentType: "image/png", bytes: 120 * 1024 });
    const { helpers, logged } = makeHelpers();
    const result = await runDesignerAgent(
      { tenantId: TENANT, prompt: "paper airplane" },
      helpers,
      { agentRunId: "ar1", triggerRunId: "tr1", tenantId: TENANT },
    );

    expect(result.prompt).toBe("paper airplane");
    expect(result.seed).toBe(7042);
    expect(result.width).toBe(1600);
    expect(result.height).toBe(900);
    expect(result.imageBytes).toBe(120 * 1024);
    expect(result.url).toContain("image.pollinations.ai");
    expect(result.savePathHint).toBeUndefined();
    expect(logged.some((l) => l.message === "designer_fetch_start")).toBe(true);
    expect(logged.some((l) => l.message === "designer_fetch_ok")).toBe(true);
  });

  it("echoes savePathHint when caller provides it", async () => {
    mockFetchOk({ contentType: "image/jpeg", bytes: 80 * 1024 });
    const { helpers } = makeHelpers();
    const result = await runDesignerAgent(
      { tenantId: TENANT, prompt: "x", savePathHint: "r2://heroes/launch-42.png" },
      helpers,
      { agentRunId: "ar1", triggerRunId: "tr1", tenantId: TENANT },
    );
    expect(result.savePathHint).toBe("r2://heroes/launch-42.png");
  });

  it("throws on non-2xx pollinations response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503, statusText: "Service Unavailable" })),
    );
    const { helpers } = makeHelpers();
    await expect(
      runDesignerAgent(
        { tenantId: TENANT, prompt: "x" },
        helpers,
        { agentRunId: "ar1", triggerRunId: "tr1", tenantId: TENANT },
      ),
    ).rejects.toThrow(/503/);
  });

  it("throws on non-image content-type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ),
    );
    const { helpers } = makeHelpers();
    await expect(
      runDesignerAgent(
        { tenantId: TENANT, prompt: "x" },
        helpers,
        { agentRunId: "ar1", triggerRunId: "tr1", tenantId: TENANT },
      ),
    ).rejects.toThrow(/text\/html/);
  });

  it("throws when the image is below the 50KB sanity floor", async () => {
    mockFetchOk({ contentType: "image/png", bytes: 1024 });
    const { helpers } = makeHelpers();
    await expect(
      runDesignerAgent(
        { tenantId: TENANT, prompt: "x" },
        helpers,
        { agentRunId: "ar1", triggerRunId: "tr1", tenantId: TENANT },
      ),
    ).rejects.toThrow(/too small/);
  });
});
