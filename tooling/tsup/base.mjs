// Shared tsup config for @launchwings/* workspace packages.
//
// Why we need this at all: workspace packages export raw TypeScript via their
// `exports` field. apps/web's Next.js handles raw TS via transpilePackages.
// apps/api on Vercel Functions runs as bare Node, which cannot load .ts. So
// each consumed workspace package compiles src/ → dist/ before deploy and the
// `exports` field points at the dist/ JS for runtime + src/ TS for types.
//
// bundle: true is required (NOT bundle: false). With bundle: false, tsup
// keeps source imports verbatim — `import "./otel"` (no extension) — and
// Node ESM strict resolution rejects them at runtime
// (Cannot find module '.../dist/otel'). bundle: true tells esbuild to inline
// each entry's internal relative imports into a self-contained bundle.
// Workspace and npm deps stay external (default), so cross-package edges
// like @launchwings/db still resolve through the package exports field.

import { defineConfig } from "tsup";

export const baseConfig = defineConfig({
  entry: ["src/**/*.ts", "!src/**/__tests__/**", "!src/**/*.test.ts"],
  format: ["esm"],
  dts: false,
  outDir: "dist",
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  target: "node22",
});
