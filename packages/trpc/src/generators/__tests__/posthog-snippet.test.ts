import { describe, expect, it } from "vitest";
import { renderPosthogSnippet } from "../posthog-snippet";

const VALID_KEY = "phc_abcdefghijklmnopqrstuvwxyz0123";

describe("renderPosthogSnippet", () => {
  it("renders a US snippet with the us.i.posthog.com host", () => {
    const { snippet } = renderPosthogSnippet({
      projectKey: VALID_KEY,
      host: "us",
    });
    expect(snippet).toContain("https://us.i.posthog.com");
    expect(snippet).not.toContain("https://eu.i.posthog.com");
  });

  it("renders an EU snippet with the eu.i.posthog.com host", () => {
    const { snippet } = renderPosthogSnippet({
      projectKey: VALID_KEY,
      host: "eu",
    });
    expect(snippet).toContain("https://eu.i.posthog.com");
    expect(snippet).not.toContain("https://us.i.posthog.com");
  });

  it("interpolates the project key into the init call", () => {
    const { snippet } = renderPosthogSnippet({
      projectKey: VALID_KEY,
      host: "us",
    });
    expect(snippet).toContain(`posthog.init('${VALID_KEY}'`);
  });

  it("wraps the snippet in <script> + commented bookends", () => {
    const { snippet } = renderPosthogSnippet({
      projectKey: VALID_KEY,
      host: "us",
    });
    expect(snippet).toContain("<!-- PostHog -->");
    expect(snippet).toContain("<!-- /PostHog -->");
    expect(snippet).toMatch(/<script>[\s\S]+<\/script>/);
  });

  it("rejects an invalid project key shape", () => {
    expect(() =>
      renderPosthogSnippet({ projectKey: "not-a-key", host: "us" }),
    ).toThrow(/projectKey must match/);
    expect(() =>
      renderPosthogSnippet({ projectKey: "phc_short", host: "us" }),
    ).toThrow(/projectKey must match/);
  });

  it("does not allow a key containing characters outside [A-Za-z0-9]", () => {
    // Defence-in-depth: the regex gate would block injection, but we assert
    // it explicitly here so future edits to the regex don't silently widen
    // it.
    expect(() =>
      renderPosthogSnippet({
        projectKey: "phc_'); alert(1); //",
        host: "us",
      }),
    ).toThrow();
  });
});
