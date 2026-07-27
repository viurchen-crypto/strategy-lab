"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGES = [
  { href: "/", label: "LAB", hint: "Backtest the catalog" },
  { href: "/screener", label: "SCREENER", hint: "Scan the index on current prices" },
  { href: "/learn", label: "LEARN", hint: "Glossary and the tutor" },
] as const;

/** The three rooms of the app, in the order you would meet them. */
export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="segmented app-nav" aria-label="Sections">
      {PAGES.map((page) => (
        <Link
          key={page.href}
          href={page.href}
          title={page.hint}
          className={pathname === page.href ? "active" : ""}
          aria-current={pathname === page.href ? "page" : undefined}
        >
          {page.label}
        </Link>
      ))}
    </nav>
  );
}
