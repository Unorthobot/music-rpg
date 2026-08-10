import type { ReactNode } from "react";
import Link from "next/link";
import { brand } from "@music-rpg/shared";
import { Label } from "@music-rpg/ui";

/**
 * Authentication framing.
 *
 * Onboarding should read as the opening of a game, so even the account step
 * keeps the same voice and composition as the rest of the flow.
 */
export function AuthLayout({
  eyebrow,
  title,
  intro,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="px-gutter py-5">
        <Link href="/" className="inline-flex items-center gap-3">
          <span
            aria-hidden
            className="h-8 w-8 rounded-sm bg-ember/90 flex items-center justify-center text-[#1a0a05] font-bold text-sm"
          >
            {brand.shortName.slice(0, 1)}
          </span>
          <span className="text-sm font-semibold">{brand.productName}</span>
        </Link>
      </header>

      <main id="main" className="flex-1 flex items-center justify-center px-gutter py-8">
        <div className="w-full max-w-[440px] flex flex-col gap-6 animate-rise-in">
          <div className="flex flex-col gap-3">
            <Label>{eyebrow}</Label>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-display text-balance">
              {title}
            </h1>
            <p className="text-base text-ink-muted">{intro}</p>
          </div>
          {children}
        </div>
      </main>

      <footer className="px-gutter py-6 text-center text-sm text-ink-subtle">{footer}</footer>
    </div>
  );
}
