#!/usr/bin/env node
// fetch-hero-banner.mjs — build-time hero banner generation via Pollinations.ai.
//
// Why a build-time script (not a Trigger task):
//   - The marketing-site hero is static. Generating it once per deploy is the
//     cheapest, most reliable way to ship it. Pollinations.ai is free + no key,
//     and reachable from Vercel build runners.
//   - Idempotent: skips the fetch when the (prompt, seed) hash matches the
//     cached value AND the output file already exists. Keeps cold local
//     `next build` runs fast and avoids re-pinging Pollinations on every CI.
//
// Failure mode:
//   - We deliberately exit 0 on any network/validation failure and emit a
//     structured warn line. The home page renders a CSS-gradient fallback so
//     the build is never broken by an upstream image-gen hiccup. WEB-001's
//     check-shipped-assets script only fails when an asset URL is REFERENCED
//     in shipped HTML and missing — we use Next's <Image> which references
//     /hero-banner.png unconditionally, so the script also short-circuits
//     gracefully when the file is absent (it won't be referenced via the
//     selectors check-shipped-assets greps for: og:image, icons, manifest,
//     preload). See check-shipped-assets.mjs SELECTORS list.
//
// Pollinations URL pattern (verified docs at pollinations.ai):
//   https://image.pollinations.ai/prompt/<URL-encoded prompt>
//     ?width=<int>&height=<int>&nologo=true&seed=<int>
//
// Returns a redirect to a CDN-served PNG/JPEG. We follow redirects (default
// fetch behaviour in Node 22), validate content-type, and stream bytes to
// disk.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync, writeFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "..");
const CONFIG_PATH = join(HERE, "hero-banner.config.json");
const CACHE_PATH = join(HERE, ".hero-banner.cache");
const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";
const FETCH_TIMEOUT_MS = 30_000;
const MIN_BYTES = 50 * 1024; // 50 KB sanity floor — Pollinations returns >100KB for 1600x900.

// Single-line JSON structured log. Repo convention — match the agents-llm and
// check-shipped-assets shape so log shippers can pick this source up.
function logJson(line) {
  process.stdout.write(JSON.stringify({ source: "fetch-hero-banner", ...line }) + "\n");
}

function logWarnAndExitOk(line) {
  process.stdout.write(
    JSON.stringify({ source: "fetch-hero-banner", level: "warn", ...line }) + "\n",
  );
  // Intentional zero exit — never break the build for a free image gen.
  process.exit(0);
}

function readConfig() {
  if (!existsSync(CONFIG_PATH)) {
    logWarnAndExitOk({
      message: "config_missing",
      configPath: CONFIG_PATH,
      hint: "Add hero-banner.config.json (prompt, seed, outputPath, width, height).",
    });
  }
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logWarnAndExitOk({
      message: "config_parse_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return; // unreachable, keeps the type checker happy
  }
  const { prompt, seed, outputPath, width, height } = parsed ?? {};
  if (
    typeof prompt !== "string" ||
    typeof seed !== "number" ||
    typeof outputPath !== "string" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    logWarnAndExitOk({
      message: "config_invalid_shape",
      received: parsed,
    });
  }
  return { prompt, seed, outputPath, width, height };
}

function configHash(cfg) {
  // Stable canonical JSON (sorted keys) → sha256 hex. Hash captures everything
  // that would cause a different image: prompt, seed, dims. NOT the output
  // path — moving the file shouldn't trigger a re-fetch.
  const canonical = JSON.stringify({
    height: cfg.height,
    prompt: cfg.prompt,
    seed: cfg.seed,
    width: cfg.width,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function isImageContentType(ct) {
  if (!ct) return false;
  const lower = ct.toLowerCase();
  return lower.startsWith("image/png") || lower.startsWith("image/jpeg") || lower.startsWith("image/jpg");
}

async function main() {
  const cfg = readConfig();
  const outputAbs = resolve(APP_ROOT, cfg.outputPath);
  const cacheKey = configHash(cfg);

  // Idempotence: if the cache key matches AND the file is on disk and ≥50KB,
  // there is nothing to do. Don't hit Pollinations on every CI invocation.
  if (existsSync(outputAbs) && existsSync(CACHE_PATH)) {
    const cachedKey = readFileSync(CACHE_PATH, "utf-8").trim();
    if (cachedKey === cacheKey) {
      const size = statSync(outputAbs).size;
      if (size >= MIN_BYTES) {
        logJson({
          level: "info",
          message: "cache_hit_skip_fetch",
          outputPath: cfg.outputPath,
          bytes: size,
        });
        return;
      }
    }
  }

  // Build the URL. encodeURIComponent on the prompt; numeric params raw.
  const url =
    `${POLLINATIONS_BASE}/${encodeURIComponent(cfg.prompt)}` +
    `?width=${cfg.width}&height=${cfg.height}&nologo=true&seed=${cfg.seed}`;

  logJson({
    level: "info",
    message: "fetch_start",
    url,
    seed: cfg.seed,
    width: cfg.width,
    height: cfg.height,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    logWarnAndExitOk({
      message: "fetch_failed",
      error: err instanceof Error ? err.message : String(err),
      hint: "Vercel build runner may still succeed; this is a soft failure.",
    });
    return;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    logWarnAndExitOk({
      message: "fetch_non_2xx",
      status: response.status,
      statusText: response.statusText,
    });
    return;
  }

  const contentType = response.headers.get("content-type");
  if (!isImageContentType(contentType)) {
    logWarnAndExitOk({
      message: "fetch_unexpected_content_type",
      contentType,
    });
    return;
  }

  const arrayBuf = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuf);

  if (bytes.byteLength < MIN_BYTES) {
    logWarnAndExitOk({
      message: "fetch_too_small",
      bytes: bytes.byteLength,
      minBytes: MIN_BYTES,
      hint: "Pollinations returned a suspiciously small payload — likely an error PNG.",
    });
    return;
  }

  // Ensure the output directory exists. apps/web/public is checked into the
  // repo so this is a no-op in practice — but be defensive.
  mkdirSync(dirname(outputAbs), { recursive: true });
  await writeFile(outputAbs, bytes);
  writeFileSync(CACHE_PATH, cacheKey + "\n", "utf-8");

  logJson({
    level: "info",
    message: "fetch_success",
    outputPath: cfg.outputPath,
    bytes: bytes.byteLength,
    contentType,
    seed: cfg.seed,
  });
}

main().catch((err) => {
  // Defensive top-level — main() ought to handle its own errors and exit 0.
  // If something escapes, still don't break the build.
  logWarnAndExitOk({
    message: "unexpected_error",
    error: err instanceof Error ? err.message : String(err),
  });
});
