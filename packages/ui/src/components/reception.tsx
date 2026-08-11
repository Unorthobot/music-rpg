import { cn } from "../cn";
import { Surface, Tag } from "../primitives";

/**
 * Reception components.
 *
 * The presentation half of one rule: **outcomes and patterns, never the
 * machinery.** Everything these take is either a count of people or a phrase
 * the simulation classified. None of them accepts a fit, a weight, a
 * coefficient, a pressure decimal, a seed or a raw momentum figure, which is
 * the cheapest way to keep those things off the screen — there is nowhere to
 * put them.
 */

export type ReceptionFigure = { label: string; value: string };

export type ReceptionHeadlineProps = {
  /** The classified sentence, e.g. "NO RECEPTION is finding its people." */
  headline: string;
  detail: string;
  /** The one thing worth knowing about who is responding. */
  insight?: string | null;
  figures: ReceptionFigure[];
  className?: string;
};

export function ReceptionHeadline({
  headline,
  detail,
  insight,
  figures,
  className,
}: ReceptionHeadlineProps) {
  return (
    <Surface
      level={2}
      padded="lg"
      className={cn("flex flex-col gap-3 border-ember-line bg-ember-soft", className)}
    >
      <p className="text-xl md:text-2xl font-semibold tracking-display text-balance">{headline}</p>
      <p className="text-sm text-ink-muted max-w-[60ch]">{detail}</p>

      {figures.length > 0 ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
          {figures.map((figure) => (
            <div key={figure.label} className="flex flex-col">
              <dt className="text-2xs uppercase tracking-label text-ink-subtle">{figure.label}</dt>
              <dd className="text-lg font-semibold tabular-nums text-ink">{figure.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {insight ? (
        <p className="text-sm text-ink border-l-2 border-ember-line pl-4">{insight}</p>
      ) : null}
    </Surface>
  );
}

/**
 * How one audience answered.
 *
 * The response is a phrase, not a percentage. "Strong response" is what the
 * player needs; the engagement rate behind it is the simulator's business.
 */
export type CohortResponseProps = {
  name: string;
  responseLabel: string;
  /** True for the audience carrying the record. */
  leading?: boolean;
  uniqueListeners: number;
  fansGained: number;
  shares: number;
  className?: string;
};

export function CohortResponse({
  name,
  responseLabel,
  leading = false,
  uniqueListeners,
  fansGained,
  shares,
  className,
}: CohortResponseProps) {
  const figures = [
    `${uniqueListeners} ${uniqueListeners === 1 ? "listener" : "listeners"}`,
    fansGained > 0 ? `${fansGained} ${fansGained === 1 ? "fan" : "fans"}` : null,
    // Sharing is only worth surfacing where it is the story of that cohort.
    shares > 0 && fansGained === 0 ? `${shares} ${shares === 1 ? "share" : "shares"}` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border bg-surface-2 px-4 py-3",
        leading ? "border-ember-line" : "border-line-subtle",
        className,
      )}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-base font-medium text-ink truncate">{name}</span>
        <span className="text-sm text-ink-muted">{figures.join(" · ")}</span>
      </div>
      <Tag tone={leading ? "ember" : "neutral"}>{responseLabel}</Tag>
    </div>
  );
}

/**
 * The trail of days.
 *
 * The point of the milestone made visible: a record does not arrive with a
 * final score, it accumulates one. Each day says what that day *was* before it
 * says what it counted.
 */
export type ReceptionDay = {
  dayIndex: number;
  line: string;
  cumulativeListeners: number;
  cumulativeFans: number;
};

export function ReceptionTrail({ days, className }: { days: ReceptionDay[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {days.map((day, index) => (
        <li key={day.dayIndex} className="flex gap-4">
          <div className="flex flex-col items-center pt-1.5">
            <span
              aria-hidden
              className={cn(
                "h-2 w-2 rounded-pill",
                index === days.length - 1 ? "bg-ember" : "bg-line-strong",
              )}
            />
            {index < days.length - 1 ? (
              <span aria-hidden className="w-px flex-1 bg-line-subtle" />
            ) : null}
          </div>
          <div className="flex flex-col gap-0.5 pb-5 last:pb-0 min-w-0">
            <span className="text-2xs uppercase tracking-label text-ink-subtle">
              Day {day.dayIndex}
            </span>
            <span className="text-base text-ink">{day.line}</span>
            <span className="text-sm text-ink-muted tabular-nums">
              {day.cumulativeListeners}{" "}
              {day.cumulativeListeners === 1 ? "listener" : "listeners"}
              {day.cumulativeFans > 0
                ? ` · ${day.cumulativeFans} ${day.cumulativeFans === 1 ? "fan" : "fans"}`
                : ""}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * One career metric, as a state and a direction.
 *
 * Deliberately without the integer. "Respect — Rising, taken seriously" tells a
 * player what happened; "Respect 4" tells them to go looking for the formula.
 */
export type PulseMetricProps = {
  label: string;
  level: string;
  movementLabel: string;
  moved: boolean;
  tone?: "fame" | "respect" | "heat" | "legacy";
  className?: string;
};

const pulseTones = {
  fame: "text-fame",
  respect: "text-respect",
  heat: "text-heat",
  legacy: "text-legacy",
} as const;

export function PulseMetric({
  label,
  level,
  movementLabel,
  moved,
  tone = "fame",
  className,
}: PulseMetricProps) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-line-subtle py-2.5 last:border-0",
        className,
      )}
    >
      <div className="flex flex-col">
        <span className={cn("text-sm font-medium", pulseTones[tone])}>{label}</span>
        {/* Level and movement legitimately coincide the moment a metric first
            exists ("Emerging" / "Emerging"); print the word once. */}
        {level.toLowerCase() === movementLabel.toLowerCase() ? null : (
          <span className="text-xs text-ink-subtle">{level}</span>
        )}
      </div>
      <span className={cn("text-sm whitespace-nowrap", moved ? "text-ink" : "text-ink-subtle")}>
        {moved ? movementLabel : "Unchanged"}
      </span>
    </div>
  );
}

/** A record that is out but has no simulated day yet. */
export function AwaitingReception({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <Surface
      level={2}
      padded="lg"
      className={cn("flex flex-col gap-2 border-ember-line bg-ember-soft", className)}
    >
      {/*
        Deliberately unlabelled. The track page already has an "Out in the
        world" heading for the public link, and two of them on one screen is
        both a duplicate and an ambiguous target for anything reading the page.
      */}
      <p className="text-xl font-semibold tracking-display text-balance">
        {title} is out. Nobody knows what happens next.
      </p>
      <p className="text-sm text-ink-muted">
        Reception takes time. Let a day pass and see who finds it.
      </p>
    </Surface>
  );
}
