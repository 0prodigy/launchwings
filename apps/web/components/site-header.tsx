import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between py-6">
      <Link
        href="/"
        className="flex items-center gap-2 text-sm font-semibold tracking-tight"
      >
        <span
          aria-hidden="true"
          className="inline-block size-2 rounded-full bg-[color:var(--color-accent)]"
        />
        LaunchWings
      </Link>
      <nav className="flex items-center gap-5 text-xs text-[color:var(--color-muted)]">
        <Link href="/about" className="hover:text-[color:var(--color-fg)]">
          About
        </Link>
        <Link href="/trust" className="hover:text-[color:var(--color-fg)]">
          Trust
        </Link>
        <a
          href="https://github.com/0prodigy/dot"
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-[color:var(--color-fg)]"
        >
          Build log
        </a>
      </nav>
    </header>
  );
}
