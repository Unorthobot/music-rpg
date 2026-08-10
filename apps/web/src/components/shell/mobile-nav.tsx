"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@music-rpg/ui";
import { primaryDestinations } from "@/lib/navigation";
import { Icon } from "./icons";

/**
 * Bottom navigation (mobile).
 *
 * Five destinations, each a 44px-plus target with a visible label — this is the
 * primary navigation model on phones, not a shrunken desktop sidebar.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="md:hidden border-t border-line-subtle bg-surface-1/95 backdrop-blur h-mobile-nav"
    >
      <ul className="grid grid-cols-5 h-full">
        {primaryDestinations.map((destination) => {
          const active = pathname === destination.href || pathname.startsWith(`${destination.href}/`);
          return (
            <li key={destination.href} className="flex">
              <Link
                href={destination.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-fast",
                  active ? "text-ink" : "text-ink-subtle",
                )}
              >
                <Icon name={destination.icon} className={cn("h-5 w-5", active && "text-ember")} />
                <span className="text-2xs">{destination.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
