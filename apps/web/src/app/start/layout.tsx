import type { ReactNode } from "react";
import { brand } from "@music-rpg/shared";

/**
 * Onboarding chrome.
 *
 * No application shell here: onboarding is the opening of a game, so the
 * navigation, player and context panel stay out of the way until the player
 * has actually entered the world.
 */
export default function StartLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-canvas">
      <header className="flex items-center gap-3 px-gutter py-5">
        <span
          aria-hidden
          className="h-8 w-8 rounded-sm bg-ember/90 flex items-center justify-center text-[#1a0a05] font-bold text-sm"
        >
          {brand.shortName.slice(0, 1)}
        </span>
        <span className="text-sm font-semibold">{brand.productName}</span>
      </header>

      <main id="main" className="flex-1 px-gutter pb-16">
        {children}
      </main>
    </div>
  );
}
