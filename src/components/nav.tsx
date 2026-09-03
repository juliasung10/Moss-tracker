"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils.ts";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/add", label: "Add / update" },
  { href: "/posts", label: "Posts" },
  { href: "/milestones", label: "Milestones" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-0.5">
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
              active ? "bg-accent-soft font-medium text-accent" : "text-ink-muted hover:bg-canvas hover:text-ink",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
