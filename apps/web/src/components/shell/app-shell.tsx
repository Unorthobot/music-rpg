import type { ReactNode } from "react";
import { Label } from "@music-rpg/ui";
import { ContextDrawer } from "./context-drawer";
import { MobileNav } from "./mobile-nav";
import { PlayerBar } from "./player-bar";
import { SideNav } from "./side-nav";

/**
 * The application shell.
 *
 * Three zones on desktop (navigation / workspace / context), a collapsed rail
 * plus drawer on tablet, and a bottom-navigation model with a mini-player on
 * mobile. Each is composed for its viewport — the mobile layout is not the
 * desktop layout scaled down.
 */
export type AppShellProps = {
  displayName: string;
  act: string;
  title: string;
  eyebrow?: string;
  /** Optional right-hand contextual content. */
  context?: ReactNode;
  contextLabel?: string;
  children: ReactNode;
};

export function AppShell({
  displayName,
  act,
  title,
  eyebrow,
  context,
  contextLabel = "Context",
  children,
}: AppShellProps) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-canvas">
      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:block w-[76px] lg:w-nav shrink-0">
          <SideNav displayName={displayName} act={act} />
        </aside>

        <div className="flex flex-1 min-w-0 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-line-subtle px-gutter py-4">
            <div className="flex flex-col min-w-0">
              {eyebrow ? <Label>{eyebrow}</Label> : null}
              <h1 className="text-xl md:text-2xl font-semibold tracking-display truncate">
                {title}
              </h1>
            </div>
            {context ? <ContextDrawer label={contextLabel}>{context}</ContextDrawer> : null}
          </header>

          <div className="flex flex-1 min-h-0">
            <main id="main" className="flex-1 min-w-0 overflow-y-auto px-gutter py-6 pb-12">
              <div className="mx-auto w-full max-w-[880px] flex flex-col gap-6">{children}</div>
            </main>

            {context ? (
              <aside className="hidden xl:block w-context shrink-0 overflow-y-auto border-l border-line-subtle px-5 py-6">
                <div className="flex flex-col gap-4">{context}</div>
              </aside>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="shrink-0">
        <PlayerBar />
        <MobileNav />
      </footer>
    </div>
  );
}
