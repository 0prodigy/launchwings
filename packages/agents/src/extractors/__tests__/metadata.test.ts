import { describe, it, expect } from "vitest";
import {
  extractTitle,
  extractMetaDescription,
  extractHeroHeadline,
  extractPrimaryCta,
  extractFrameworkHints,
} from "../metadata";

describe("extractTitle", () => {
  it("returns the trimmed contents of <title>", () => {
    expect(extractTitle("<html><head><title>  LaunchWings &amp; Co  </title></head></html>")).toBe(
      "LaunchWings & Co",
    );
  });
  it("returns null for empty input", () => {
    expect(extractTitle("")).toBeNull();
  });
});

describe("extractMetaDescription", () => {
  it("reads <meta name=\"description\">", () => {
    const html = `<head><meta name="description" content="Ship faster."></head>`;
    expect(extractMetaDescription(html)).toBe("Ship faster.");
  });
  it("falls back to og:description when name=description is missing", () => {
    const html = `<head><meta property="og:description" content="OG fallback"></head>`;
    expect(extractMetaDescription(html)).toBe("OG fallback");
  });
  it("returns null when no description tag exists", () => {
    expect(extractMetaDescription("<html></html>")).toBeNull();
  });
  it("returns null for empty input", () => {
    expect(extractMetaDescription("")).toBeNull();
  });
});

describe("extractHeroHeadline", () => {
  it("returns the first non-empty <h1>", () => {
    const html = "<h1>   </h1><h1>Real Headline</h1>";
    expect(extractHeroHeadline(html)).toBe("Real Headline");
  });
  it("strips inline tags inside the h1", () => {
    expect(extractHeroHeadline("<h1>Build <span>faster</span></h1>")).toBe("Build faster");
  });
  it("returns null when no h1", () => {
    expect(extractHeroHeadline("<p>nope</p>")).toBeNull();
  });
  it("returns null for empty input", () => {
    expect(extractHeroHeadline("")).toBeNull();
  });
});

describe("extractPrimaryCta", () => {
  it("matches the first action-verb anchor", () => {
    const html = `<a href="/pricing">Pricing</a><a href="/start">Get started</a>`;
    expect(extractPrimaryCta(html)).toBe("Get started");
  });
  it("matches a button as well", () => {
    expect(extractPrimaryCta(`<button>Sign up</button>`)).toBe("Sign up");
  });
  it("returns null when no CTA-shaped text exists", () => {
    expect(extractPrimaryCta(`<a href="/blog">Blog</a>`)).toBeNull();
  });
  it("returns null for empty input", () => {
    expect(extractPrimaryCta("")).toBeNull();
  });
});

describe("extractFrameworkHints", () => {
  it("detects next.js from script src", () => {
    const html = `<script src="/_next/static/abc.js"></script>`;
    expect(extractFrameworkHints(html)).toContain("next.js");
  });
  it("detects astro via meta generator", () => {
    const html = `<meta name="generator" content="Astro v4.5.0">`;
    expect(extractFrameworkHints(html)).toContain("astro");
  });
  it("dedupes when the same framework is hinted twice", () => {
    const html = `<meta name="generator" content="Next.js"><script src="/_next/x.js"></script>`;
    const hints = extractFrameworkHints(html);
    expect(hints.filter((h) => h === "next.js")).toHaveLength(1);
  });
  it("returns [] for empty input", () => {
    expect(extractFrameworkHints("")).toEqual([]);
  });
});
