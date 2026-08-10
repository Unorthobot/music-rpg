"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@music-rpg/ui";

/**
 * The contextual zone.
 *
 * Desktop: a persistent third column (rendered by the shell, not here).
 * Tablet and mobile: the same content behind a toggle, presented as an overlay
 * drawer. Escape closes it, focus is not trapped away from the page behind, and
 * the toggle is a plain button with an accessible name.
 */
export function ContextDrawer({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="xl:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-md border border-line px-3 min-h-[44px] text-sm text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-fast"
      >
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 animate-fade-in"
          />
          <div
            role="dialog"
            aria-label={label}
            className={cn(
              "relative z-10 h-full w-full max-w-[380px] bg-surface-1 border-l border-line",
              "flex flex-col animate-rise-in overflow-y-auto",
            )}
          >
            <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
              <span className="text-sm font-semibold text-ink">{label}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[44px] px-2 text-sm text-ink-muted hover:text-ink"
              >
                Close
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4">{children}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
