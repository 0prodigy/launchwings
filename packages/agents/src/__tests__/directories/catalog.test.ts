// F2 PR1 — directory catalog assertions.
//
// The catalog is reference data the seed script syncs to the directory_catalog
// table. These tests guard against regressions in the in-code list (someone
// adds a malformed entry, breaks a URL, etc.) before the seed runs.

import { describe, expect, it } from "vitest";
import { DIRECTORY_CATALOG } from "../../directories/catalog";

describe("directory catalog", () => {
  it("has at least 30 entries", () => {
    expect(DIRECTORY_CATALOG.length).toBeGreaterThanOrEqual(30);
  });

  it("every entry has the required fields", () => {
    for (const entry of DIRECTORY_CATALOG) {
      // Stable identity
      expect(entry.slug, "slug present").toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(entry.name, `name present for ${entry.slug}`).toBeTruthy();
      expect(entry.submissionUrl, `submissionUrl for ${entry.slug}`).toBeTruthy();
      expect(["api", "browser_form", "manual"]).toContain(entry.automationKind);
      expect(["launch", "directory", "newsletter", "forum", "review", "social"]).toContain(
        entry.category,
      );
      expect(typeof entry.enabled).toBe("boolean");
      // Field schema sanity
      expect(entry.fieldSchemaJson).toBeDefined();
      expect(Array.isArray(entry.fieldSchemaJson.fields)).toBe(true);
      expect(entry.fieldSchemaJson.fields.length).toBeGreaterThan(0);
      for (const field of entry.fieldSchemaJson.fields) {
        expect(field.key, `field.key in ${entry.slug}`).toBeTruthy();
        expect(field.label).toBeTruthy();
        expect([
          "text",
          "longtext",
          "url",
          "email",
          "image_url",
          "select",
          "date",
        ]).toContain(field.type);
        expect(typeof field.required).toBe("boolean");
        if (field.maxLength !== undefined) {
          expect(field.maxLength).toBeGreaterThan(0);
        }
      }
    }
  });

  it("every submission URL is a valid URL", () => {
    for (const entry of DIRECTORY_CATALOG) {
      // URL constructor throws on invalid; assertion is the absence of throw.
      expect(() => new URL(entry.submissionUrl), `invalid URL for ${entry.slug}`).not.toThrow();
    }
  });

  it("slugs are unique", () => {
    const seen = new Set<string>();
    for (const entry of DIRECTORY_CATALOG) {
      expect(seen.has(entry.slug), `duplicate slug ${entry.slug}`).toBe(false);
      seen.add(entry.slug);
    }
  });

  it("automation_kind distribution is sensible (some api, some form, some manual)", () => {
    // Per docs/research/03-integrations.md: ~80% of directories require human
    // touch. We don't pin a hard ratio, but each bucket must have ≥1 entry.
    const counts: Record<string, number> = { api: 0, browser_form: 0, manual: 0 };
    for (const entry of DIRECTORY_CATALOG) {
      counts[entry.automationKind] = (counts[entry.automationKind] ?? 0) + 1;
    }
    // We may legitimately ship PR1 with zero `api` entries (no API directories
    // wired yet). The other two MUST be populated.
    expect(counts.browser_form, "at least one browser_form entry").toBeGreaterThan(0);
    expect(counts.manual, "at least one manual entry").toBeGreaterThan(0);
    // Manual + browser_form together should dominate (docs/research evidence).
    const humanTouch = (counts.browser_form ?? 0) + (counts.manual ?? 0);
    expect(humanTouch).toBeGreaterThan(counts.api ?? 0);
  });

  it("includes the strategically-required entries from PRD §F2", () => {
    // The PRD names these explicitly as the directories the founder expects
    // out of the box. If we drop one we should know.
    const required = [
      "product-hunt",
      "betalist",
      "indie-hackers",
      "alternativeto",
      "saashub",
      "g2",
      "capterra",
      "getapp",
      "hacker-news",
      "lobsters",
      "reddit-saas",
      "reddit-sideproject",
      "reddit-startups",
      "reddit-indiehackers",
      "tiny-startups",
      "microlaunch",
      "peerlist",
      "uneed",
      "dev-to",
      "hashnode",
      "medium",
      "launch-news",
      "startups-fyi",
      "launching-next",
      "betafy",
      "fazier",
      "mind-the-product",
    ];
    const present = new Set(DIRECTORY_CATALOG.map((d) => d.slug));
    for (const slug of required) {
      expect(present.has(slug), `missing required directory ${slug}`).toBe(true);
    }
  });
});
