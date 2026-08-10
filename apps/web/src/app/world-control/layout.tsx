import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@music-rpg/shared";
import { getCurrentUser, isInternalUser } from "@/lib/session";

export const metadata = { title: "World Control" };

/**
 * World Control — the internal inspector.
 *
 * A protected route rather than a separate deployment for now; it reads the
 * same domain packages the app does. Access requires an internal account or an
 * allow-listed email, and it is read-only: this exists to answer "what actually
 * happened?", not to edit the simulation.
 */
export default async function WorldControlLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isInternalUser(user)) redirect("/home");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-canvas">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line-subtle px-gutter py-4">
        <Link href="/world-control" className="text-sm font-semibold">
          World Control
        </Link>
        <span className="text-xs text-ink-subtle">{brand.productName} · internal</span>
        <nav className="flex gap-4 text-xs text-ink-muted ml-auto">
          <Link href="/world-control" className="hover:text-ink">
            Overview
          </Link>
          <Link href="/world-control/careers" className="hover:text-ink">
            Careers
          </Link>
          <Link href="/world-control/events" className="hover:text-ink">
            Events
          </Link>
          <Link href="/home" className="hover:text-ink">
            Back to app
          </Link>
        </nav>
      </header>

      <main id="main" className="flex-1 px-gutter py-6">
        <div className="mx-auto w-full max-w-[1100px] flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
