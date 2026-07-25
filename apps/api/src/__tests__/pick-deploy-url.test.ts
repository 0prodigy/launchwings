import { describe, expect, it } from "vitest";
// Import directly from the source module — the package's `exports.import`
// maps to `./dist/index.js` which isn't built during vitest runs.
import { pickDeployUrl } from "../../../../packages/trpc/src/routers/products";

// ONB-03 deploy-URL precedence:
//   1. package.json `homepage` (URL-shaped)
//   2. GitHub repo `homepage` field (URL-shaped)
//   3. README first https URL not on a known badge / repo host
//   4. null
describe("pickDeployUrl", () => {
  it("prefers package.json homepage when URL-shaped", () => {
    const got = pickDeployUrl({
      repoHomepage: "https://repo-homepage.example.com",
      packageJsonHomepage: "https://pkg-homepage.example.com",
      readmeText: "see https://readme-link.example.com",
    });
    expect(got).toBe("https://pkg-homepage.example.com");
  });

  it("falls back to repo homepage when package.json homepage missing or non-URL", () => {
    const got = pickDeployUrl({
      repoHomepage: "https://repo-homepage.example.com",
      packageJsonHomepage: "not a url",
      readmeText: "see https://readme-link.example.com",
    });
    expect(got).toBe("https://repo-homepage.example.com");
  });

  it("falls back to README https URL when both homepages missing, skipping badge hosts", () => {
    const readme = `
# project
[![CI](https://img.shields.io/badge/build-passing-green)](https://github.com/me/proj/actions)
Live demo at https://my-deploy.example.com — try it out.
    `;
    const got = pickDeployUrl({
      repoHomepage: null,
      packageJsonHomepage: undefined,
      readmeText: readme,
    });
    expect(got).toBe("https://my-deploy.example.com/");
  });

  it("returns null when nothing usable is available", () => {
    const readme = `
[![badge](https://img.shields.io/x.svg)](https://github.com/me/proj)
See raw asset at https://raw.githubusercontent.com/me/proj/main/logo.png
    `;
    const got = pickDeployUrl({
      repoHomepage: null,
      packageJsonHomepage: null,
      readmeText: readme,
    });
    expect(got).toBeNull();
  });
});
