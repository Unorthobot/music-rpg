"use client";

import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * ChoiceCard — the core interaction of Sound Discovery and the solo/group fork.
 *
 * Accessibility rules baked in rather than left to the caller:
 * - a real `<button>`, so keyboard and screen readers work by default;
 * - selection is announced through `aria-pressed`, not colour alone;
 * - a visible selected marker (border + dot + "Selected" text), so meaning
 *   never depends on hue;
 * - full-width stacking on small screens — no two-column comparison that would
 *   need horizontal compression on a phone.
 */
export type ChoiceCardProps = {
  label: string;
  detail?: string | null;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  /** Optional larger presentation for the SOLO / GROUP fork. */
  size?: "md" | "lg";
  /** Extra content under the detail line (used by the group fork). */
  children?: ReactNode;
  className?: string;
};

export function ChoiceCard({
  label,
  detail,
  selected = false,
  disabled = false,
  onSelect,
  size = "md",
  children,
  className,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "group relative w-full text-left rounded-lg border bg-surface-2 transition-all duration-fast ease-out",
        "hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember",
        size === "md" && "p-4 md:p-5 min-h-[72px]",
        size === "lg" && "p-6 md:p-8 min-h-[140px]",
        selected ? "border-ember bg-ember-soft" : "border-line-subtle",
        className,
      )}
    >
      <span className="flex items-start justify-between gap-4">
        <span className="flex flex-col gap-1.5 min-w-0">
          <span
            className={cn(
              "font-medium text-ink",
              size === "lg" ? "text-xl md:text-2xl tracking-display" : "text-base md:text-lg",
            )}
          >
            {label}
          </span>
          {detail ? (
            <span className={cn("text-ink-muted", size === "lg" ? "text-base" : "text-sm")}>
              {detail}
            </span>
          ) : null}
          {children}
        </span>

        <span
          aria-hidden
          className={cn(
            "mt-1 h-5 w-5 shrink-0 rounded-pill border-2 transition-colors duration-fast",
            selected ? "border-ember bg-ember" : "border-line-strong bg-transparent",
          )}
        />
      </span>

      {selected ? (
        <span className="mt-3 inline-flex items-center gap-2 text-2xs uppercase tracking-label text-ember">
          Selected
        </span>
      ) : null}
    </button>
  );
}
