import type { ReactNode } from "react";
import { cn } from "../cn";
import { Button, Label, Skeleton, Surface } from "../primitives";

/**
 * The three states every asynchronous surface must have, plus the empty state.
 *
 * Empty states in this product are narrative, not apologetic: a quiet scene is
 * a fact about the world, not a missing feature.
 */

export type EmptyStateProps = {
  /** Short uppercase eyebrow, e.g. "CATALOGUE". */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Rendered under the description — usually a Button or LinkButton. */
  action?: ReactNode;
  /** Marks a surface that exists but is not playable yet. */
  comingNext?: boolean;
  className?: string;
};

export function EmptyState({
  eyebrow,
  title,
  description,
  action,
  comingNext,
  className,
}: EmptyStateProps) {
  return (
    <Surface
      level={1}
      padded="lg"
      className={cn("flex flex-col items-start gap-3 text-left", className)}
    >
      {eyebrow ? <Label>{eyebrow}</Label> : null}
      <p className="text-lg md:text-xl font-medium text-ink max-w-[46ch] text-balance">{title}</p>
      {description ? (
        <p className="text-sm text-ink-muted max-w-[60ch]">{description}</p>
      ) : null}
      {comingNext ? (
        <span className="inline-flex items-center gap-2 text-2xs uppercase tracking-label text-ink-subtle">
          <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-ink-subtle" />
          Opens in a later milestone
        </span>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </Surface>
  );
}

export function LoadingState({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <Surface level={1} padded="lg" aria-busy className="flex flex-col gap-4">
      <span className="sr-only" role="status">
        {label}
      </span>
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={cn("h-4", index === 0 ? "w-3/4" : "w-full")} />
      ))}
    </Surface>
  );
}

export type ErrorStateProps = {
  title?: string;
  description?: string;
  /** Retry is required on every failing surface — never a dead end. */
  onRetry?: () => void;
  retryHref?: string;
  className?: string;
};

export function ErrorState({
  title = "That didn't load",
  description = "Your career is safe — this screen just couldn't reach it. Try again.",
  onRetry,
  retryHref,
  className,
}: ErrorStateProps) {
  return (
    <Surface
      level={1}
      padded="lg"
      role="alert"
      className={cn("flex flex-col items-start gap-3 border-danger/30", className)}
    >
      <Label>Something broke</Label>
      <p className="text-lg font-medium text-ink">{title}</p>
      <p className="text-sm text-ink-muted max-w-[60ch]">{description}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      ) : retryHref ? (
        <a
          href={retryHref}
          className="mt-2 text-sm text-ember underline underline-offset-4 min-h-[44px] inline-flex items-center"
        >
          Try again
        </a>
      ) : null}
    </Surface>
  );
}
