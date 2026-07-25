import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto flex flex-col gap-2 border-t border-[color:var(--color-border)] py-8 text-xs text-[color:var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
      <p>© {new Date().getFullYear()} LaunchWings. Built in public.</p>
      <nav className="flex items-center gap-4">
        <Link href="/about" className="hover:text-[color:var(--color-fg)]">
          About
        </Link>
        <Link href="/privacy" className="hover:text-[color:var(--color-fg)]">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-[color:var(--color-fg)]">
          Terms
        </Link>
        <Link href="/trust" className="hover:text-[color:var(--color-fg)]">
          Trust
        </Link>
      </nav>
    </footer>
  );
}
