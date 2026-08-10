import type { ReactNode } from "react";
import { cn } from "../cn";
import { Label, Surface } from "../primitives";

/**
 * Career-state components.
 *
 * Fame, Respect, Heat and Legacy are four separate currencies with four
 * separate colours — the UI must never imply they roll up into one score.
 */

export type CareerMetricProps = {
  label: string;
  value: string;
  /** Sub-line: what this number actually means right now. */
  descriptor?: string;
  tone?: "fame" | "respect" | "heat" | "legacy" | "money" | "neutral";
  className?: string;
};

const metricTones: Record<NonNullable<CareerMetricProps["tone"]>, string> = {
  fame: "text-fame",
  respect: "text-respect",
  heat: "text-heat",
  legacy: "text-legacy",
  money: "text-ink",
  neutral: "text-ink",
};

export function CareerMetric({
  label,
  value,
  descriptor,
  tone = "neutral",
  className,
}: CareerMetricProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border border-line-subtle bg-surface-2 px-4 py-3",
        className,
      )}
    >
      <Label>{label}</Label>
      <span className={cn("text-xl md:text-2xl font-semibold tabular-nums", metricTones[tone])}>
        {value}
      </span>
      {descriptor ? <span className="text-xs text-ink-subtle">{descriptor}</span> : null}
    </div>
  );
}

/**
 * StatDescriptor shows what a hidden number means without showing the number.
 * "Strong storytelling", not "storytelling: 71".
 */
export type StatDescriptorProps = {
  name: string;
  descriptor: string;
  detail?: string;
  className?: string;
};

export function StatDescriptor({ name, descriptor, detail, className }: StatDescriptorProps) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-line-subtle py-2.5 last:border-0",
        className,
      )}
    >
      <div className="flex flex-col">
        <span className="text-sm text-ink">{name}</span>
        {detail ? <span className="text-xs text-ink-subtle">{detail}</span> : null}
      </div>
      <span className="text-sm text-ink-muted whitespace-nowrap">{descriptor}</span>
    </div>
  );
}

/**
 * RelationshipState is the shape every future relationship (NPCs, labels,
 * crew, rivals) renders through. In M1 only group membership uses it.
 */
export type RelationshipStateProps = {
  name: string;
  role?: string;
  /** Qualitative standing — never a raw affinity number. */
  standing: string;
  tone?: "positive" | "neutral" | "strained";
  note?: string;
  className?: string;
};

const standingTones = {
  positive: "text-positive border-positive/40",
  neutral: "text-ink-muted border-line",
  strained: "text-warning border-warning/40",
} as const;

export function RelationshipState({
  name,
  role,
  standing,
  tone = "neutral",
  note,
  className,
}: RelationshipStateProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-2 border border-line-subtle px-4 py-3",
        className,
      )}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-base font-medium text-ink truncate">{name}</span>
        {role ? <span className="text-xs text-ink-subtle">{role}</span> : null}
        {note ? <span className="text-xs text-ink-muted mt-1">{note}</span> : null}
      </div>
      <span
        className={cn(
          "shrink-0 rounded-pill border px-3 py-1 text-2xs uppercase tracking-label",
          standingTones[tone],
        )}
      >
        {standing}
      </span>
    </div>
  );
}

/**
 * ContextPanel is the right-hand zone on desktop and a drawer/overlay on
 * smaller screens. It never carries content the player cannot reach elsewhere.
 */
export type ContextPanelProps = {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function ContextPanel({ title, eyebrow, children, footer, className }: ContextPanelProps) {
  return (
    <Surface
      level={1}
      padded={false}
      className={cn("flex flex-col overflow-hidden", className)}
      aria-label={title}
    >
      <div className="border-b border-line-subtle px-5 py-4">
        {eyebrow ? <Label>{eyebrow}</Label> : null}
        <p className="text-base font-semibold text-ink mt-1">{title}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">{children}</div>
      {footer ? <div className="border-t border-line-subtle px-5 py-4">{footer}</div> : null}
    </Surface>
  );
}
