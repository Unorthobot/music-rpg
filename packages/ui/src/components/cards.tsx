import type { ReactNode } from "react";
import { cn } from "../cn";
import { Label, Tag } from "../primitives";

/**
 * Entity cards.
 *
 * A card is an identity, not a database row: it leads with the name, then what
 * that name sounds like, then anything measured. Cards used before their system
 * exists (TrackCard, MissionCard) render a locked state rather than fake data.
 */

/** Monogram stands in until artwork generation exists. */
function Monogram({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0 inline-flex items-center justify-center rounded-md bg-surface-3 text-ink-muted font-semibold tracking-display border border-line-subtle",
        size === "sm" && "h-9 w-9 text-xs",
        size === "md" && "h-12 w-12 text-sm",
        size === "lg" && "h-16 w-16 text-lg",
      )}
    >
      {initials}
    </span>
  );
}

export type ArtistCardProps = {
  stageName: string;
  archetype?: string | null;
  origin?: string | null;
  soundSummary?: string | null;
  tags?: string[];
  href?: string;
  /** Right-aligned slot: a button, a role, a standing. */
  aside?: ReactNode;
  className?: string;
};

export function ArtistCard({
  stageName,
  archetype,
  origin,
  soundSummary,
  tags,
  href,
  aside,
  className,
}: ArtistCardProps) {
  const body = (
    <div className="flex items-start gap-4">
      <Monogram name={stageName} />
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-lg font-semibold text-ink tracking-display">{stageName}</span>
          {archetype ? <span className="text-xs text-ember">{archetype}</span> : null}
        </div>
        {origin ? <span className="text-xs text-ink-subtle">{origin}</span> : null}
        {soundSummary ? (
          <p className="text-sm text-ink-muted mt-1 line-clamp-2">{soundSummary}</p>
        ) : null}
        {tags?.length ? (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ) : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );

  const shell = cn(
    "block rounded-lg border border-line-subtle bg-surface-2 p-4 md:p-5 transition-colors duration-fast",
    href && "hover:border-line-strong hover:bg-surface-3",
    className,
  );

  return href ? (
    <a href={href} className={shell}>
      {body}
    </a>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export type GroupCardProps = {
  name: string;
  memberCount: number;
  archetype?: string | null;
  soundSummary?: string | null;
  chemistry?: { label: string; summary: string } | null;
  href?: string;
  className?: string;
};

export function GroupCard({
  name,
  memberCount,
  archetype,
  soundSummary,
  chemistry,
  href,
  className,
}: GroupCardProps) {
  const body = (
    <div className="flex items-start gap-4">
      <Monogram name={name} size="lg" />
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xl font-semibold text-ink tracking-display">{name}</span>
          {archetype ? <span className="text-xs text-ember">{archetype}</span> : null}
        </div>
        <span className="text-xs text-ink-subtle">
          {memberCount} {memberCount === 1 ? "member" : "members"}
        </span>
        {soundSummary ? <p className="text-sm text-ink-muted mt-1">{soundSummary}</p> : null}
        {chemistry ? (
          <div className="mt-3 rounded-md border border-line-subtle bg-surface-inset px-3 py-2">
            <Label>Chemistry — {chemistry.label}</Label>
            <p className="text-sm text-ink-muted mt-1">{chemistry.summary}</p>
          </div>
        ) : null}
      </div>
    </div>
  );

  const shell = cn(
    "block rounded-lg border border-line-subtle bg-surface-2 p-5 transition-colors duration-fast",
    href && "hover:border-line-strong hover:bg-surface-3",
    className,
  );

  return href ? (
    <a href={href} className={shell}>
      {body}
    </a>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/**
 * TrackCard — the catalogue unit. Nothing produces tracks until the Studio
 * milestone, so the only state it renders today is the locked one.
 */
export type TrackCardProps = {
  title: string;
  artistName?: string;
  duration?: string;
  state?: "READY" | "LOCKED";
  className?: string;
};

export function TrackCard({
  title,
  artistName,
  duration,
  state = "LOCKED",
  className,
}: TrackCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-md border border-line-subtle bg-surface-2 px-4 py-3",
        state === "LOCKED" && "opacity-60",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-10 w-10 shrink-0 rounded-sm bg-surface-3 border border-line-subtle"
      />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-base text-ink truncate">{title}</span>
        {artistName ? <span className="text-xs text-ink-subtle">{artistName}</span> : null}
      </div>
      <span className="text-xs text-ink-subtle tabular-nums">{duration ?? "—:—"}</span>
    </div>
  );
}

/**
 * MissionCard — story/mission surface. Missions arrive in a later milestone;
 * until then this renders as an explicitly inactive card rather than a
 * convincing fake.
 */
export type MissionCardProps = {
  title: string;
  summary: string;
  status?: "AVAILABLE" | "LOCKED";
  className?: string;
};

export function MissionCard({ title, summary, status = "LOCKED", className }: MissionCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-5",
        status === "LOCKED"
          ? "border-line-subtle bg-surface-1 opacity-70"
          : "border-ember-line bg-ember-soft",
        className,
      )}
      aria-disabled={status === "LOCKED"}
    >
      <div className="flex items-center justify-between gap-3">
        <Label>{status === "LOCKED" ? "Not yet" : "Story"}</Label>
      </div>
      <p className="text-base font-medium text-ink">{title}</p>
      <p className="text-sm text-ink-muted">{summary}</p>
    </div>
  );
}

/**
 * WorldEventCard renders one entry of the canonical log in player-facing
 * language. World activity begins in a later milestone; the component reads
 * real events today (a career's own history) rather than placeholders.
 */
export type WorldEventCardProps = {
  label: string;
  description?: string;
  timestamp: string;
  importance?: number;
  className?: string;
};

export function WorldEventCard({
  label,
  description,
  timestamp,
  importance = 10,
  className,
}: WorldEventCardProps) {
  return (
    <article
      className={cn(
        "flex gap-4 rounded-md border border-line-subtle bg-surface-2 px-4 py-3",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-pill",
          importance >= 70 ? "bg-ember" : importance >= 40 ? "bg-ink-muted" : "bg-ink-subtle",
        )}
      />
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm text-ink">{label}</span>
        {description ? <span className="text-xs text-ink-muted">{description}</span> : null}
        <time className="text-2xs uppercase tracking-label text-ink-subtle">{timestamp}</time>
      </div>
    </article>
  );
}
