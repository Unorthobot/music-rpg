"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@music-rpg/shared";
import { cn } from "@music-rpg/ui";
import { primaryDestinations, utilityDestinations } from "@/lib/navigation";
import { Icon } from "./icons";

/**
 * Persistent left navigation (desktop and tablet).
 *
 * On tablet it collapses to an icon rail; labels stay in the accessible name so
 * the collapse costs nothing to screen-reader users.
 */
export function SideNav({ displayName, act }: { displayName: string; act: string }) {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Primary"
      className="flex h-full flex-col gap-6 border-r border-line-subtle bg-surface-1 px-3 py-5 lg:px-4"
    >
      <Link
        href="/home"
        className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2 transition-colors duration-fast"
      >
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-sm bg-ember/90 flex items-center justify-center text-[#1a0a05] font-bold text-sm"
        >
          {brand.shortName.slice(0, 1)}
        </span>
        <span className="hidden lg:flex flex-col leading-tight min-w-0">
          <span className="text-sm font-semibold text-ink truncate">{brand.productName}</span>
          <span className="text-2xs uppercase tracking-label text-ink-subtle">{act}</span>
        </span>
      </Link>

      <ul className="flex flex-col gap-1">
        {primaryDestinations.map((destination) => (
          <li key={destination.href}>
            <Link
              href={destination.href}
              aria-current={isActive(destination.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 min-h-[44px] transition-colors duration-fast",
                isActive(destination.href)
                  ? "bg-surface-3 text-ink"
                  : "text-ink-muted hover:text-ink hover:bg-surface-2",
              )}
            >
              <Icon name={destination.icon} />
              <span className="hidden lg:inline text-sm">{destination.label}</span>
              <span className="lg:hidden sr-only">{destination.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-1">
        <ul className="flex flex-col gap-1">
          {utilityDestinations.map((destination) => (
            <li key={destination.href}>
              <Link
                href={destination.href}
                aria-current={isActive(destination.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 min-h-[44px] text-ink-subtle transition-colors duration-fast",
                  isActive(destination.href)
                    ? "bg-surface-2 text-ink"
                    : "hover:text-ink hover:bg-surface-2",
                )}
              >
                <Icon name={destination.icon} className="h-4 w-4" />
                <span className="hidden lg:inline text-xs">{destination.label}</span>
                <span className="lg:hidden sr-only">{destination.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden lg:block border-t border-line-subtle pt-3 mt-2 px-3">
          <p className="text-xs text-ink-muted truncate">{displayName}</p>
        </div>
      </div>
    </nav>
  );
}
