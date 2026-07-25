import { describe, expect, it } from "vitest";
import { renderPrivacyPolicy } from "../privacy-policy";

const baseInputs = {
  orgName: "Acme Inc.",
  contactEmail: "privacy@acme.com",
  productName: "Acme Web",
  productUrl: "https://acme.com",
};

describe("renderPrivacyPolicy", () => {
  it("includes every required section", () => {
    const { markdown } = renderPrivacyPolicy({ ...baseInputs, jurisdiction: "US" });
    for (const section of [
      "# Privacy Policy",
      "## Information We Collect",
      "## How We Use It",
      "## Sharing",
      "## Cookies",
      "## Your Rights",
      "## Data Retention",
      "## Security",
      "## Children",
      "## Changes to This Policy",
      "## Contact",
    ]) {
      expect(markdown).toContain(section);
    }
  });

  it("interpolates organization name, contact email, and product URL", () => {
    const { markdown } = renderPrivacyPolicy({ ...baseInputs, jurisdiction: "US" });
    expect(markdown).toContain("Acme Inc.");
    expect(markdown).toContain("privacy@acme.com");
    expect(markdown).toContain("https://acme.com");
    expect(markdown).toContain("Acme Web");
  });

  it("omits the URL parens when productUrl is null", () => {
    const { markdown } = renderPrivacyPolicy({
      ...baseInputs,
      productUrl: null,
      jurisdiction: "US",
    });
    expect(markdown).not.toContain("(https://");
    expect(markdown).toContain("Acme Web");
  });

  it("includes CCPA wording for US jurisdiction", () => {
    const { markdown } = renderPrivacyPolicy({ ...baseInputs, jurisdiction: "US" });
    expect(markdown).toMatch(/California Consumer Privacy Act \(CCPA\)/);
    expect(markdown).not.toMatch(/General Data Protection Regulation/);
  });

  it("includes GDPR wording for EU jurisdiction", () => {
    const { markdown } = renderPrivacyPolicy({ ...baseInputs, jurisdiction: "EU" });
    expect(markdown).toContain("General Data Protection Regulation");
    expect(markdown).not.toMatch(/UK GDPR/);
    expect(markdown).not.toMatch(/CCPA/);
  });

  it("includes UK GDPR wording for UK jurisdiction", () => {
    const { markdown } = renderPrivacyPolicy({ ...baseInputs, jurisdiction: "UK" });
    expect(markdown).toContain("UK GDPR");
  });

  it("falls back to a generic rights paragraph for Other jurisdiction", () => {
    const { markdown } = renderPrivacyPolicy({ ...baseInputs, jurisdiction: "Other" });
    expect(markdown).not.toMatch(/CCPA/);
    expect(markdown).not.toMatch(/GDPR/);
    expect(markdown).toMatch(/Depending on your jurisdiction/);
  });

  it("stamps a Last updated date in YYYY-MM-DD shape", () => {
    const { markdown } = renderPrivacyPolicy({ ...baseInputs, jurisdiction: "US" });
    expect(markdown).toMatch(/_Last updated: \d{4}-\d{2}-\d{2}_/);
  });
});
