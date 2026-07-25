import Image from "next/image";
import { existsSync } from "node:fs";
import { join } from "node:path";

// HeroBanner — full-bleed editorial banner at the top of the home hero.
//
// The image at /hero-banner.png is generated at build time by
// apps/web/scripts/fetch-hero-banner.mjs (Pollinations.ai, free, no key).
// In dev/CI without the prebuild step, the file may be absent — we
// short-circuit to a CSS gradient fallback so SSR never references a missing
// asset. That keeps WEB-001's check-shipped-assets script green regardless of
// whether Pollinations was reachable at build time.
//
// Why module-load (not render-time) existsSync: the home page is statically
// prerendered by Next 15, and we want to keep it that way. Doing the syscall
// at render time would mark the page dynamic. We only need the answer ONCE,
// at build time on Vercel: either the prebuild script populated the file or
// it didn't. Caching the boolean at module init resolves the answer during
// the static build pass; the rendered HTML hard-codes either the <Image>
// reference or the gradient fallback. WEB-001's check-shipped-assets greps
// the prerendered HTML for /hero-banner.png — when the file is absent we
// don't reference it, so the check stays green either way.

const FALLBACK_CLASS =
  "aspect-[16/9] w-full rounded-2xl bg-gradient-to-br from-neutral-900 via-indigo-900 to-stone-700";

const HERO_PATH = join(process.cwd(), "public", "hero-banner.png");
const HERO_EXISTS: boolean = (() => {
  try {
    return existsSync(HERO_PATH);
  } catch {
    return false;
  }
})();

export function HeroBanner() {
  if (!HERO_EXISTS) {
    return (
      <div
        aria-hidden="true"
        role="presentation"
        className={FALLBACK_CLASS}
        data-hero-fallback="true"
      />
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl">
      <Image
        // The static path is referenced in shipped HTML only when the file
        // exists (see existsSync above). check-shipped-assets sees a real
        // file under public/ and passes.
        src="/hero-banner.png"
        alt=""
        width={1600}
        height={900}
        priority
        sizes="(max-width: 768px) 100vw, 768px"
        className="h-auto w-full"
      />
    </div>
  );
}
