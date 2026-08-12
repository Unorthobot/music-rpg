import type { ReactNode } from "react";
import { formatMoney, type PlayerOffer } from "@music-rpg/shared";
import { cn } from "../cn";
import { Label, Surface, Tag } from "../primitives";

/**
 * Offers, on screen.
 *
 * Presentational only, and pointedly so: every one of these takes a
 * `PlayerOffer` and renders it. None of them takes a row, a status, a billing
 * enum or a score, which means there is no version of these components that
 * could leak the director even if somebody wanted them to.
 *
 * The tone rule for all of it: a card says who is asking, what they are asking
 * for, when, and how long there is. It never says how the world arrived at the
 * question.
 */

/** A game date, written the way a person would say it. */
export function offerDate(value: Date, options: { weekday?: boolean } = {}): string {
  return new Date(value).toLocaleDateString("en-ZA", {
    ...(options.weekday === false ? {} : { weekday: "long" }),
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** The fee, said in the direction the money actually moves. */
export function offerFeeLine(offer: PlayerOffer): string | null {
  if (offer.feeMinor === null) return null;
  if (offer.feeDirection === "COSTS") return `${formatMoney(offer.feeMinor)} to book`;
  return offer.feeMinor === 0 ? "Door split" : formatMoney(offer.feeMinor);
}

/** The essentials, in the order a person would say them. */
function termsOf(offer: PlayerOffer): string[] {
  const parts: string[] = [];

  if (offer.night) parts.push(offerDate(offer.night.at));
  if (offer.night?.capacity) parts.push(`${offer.night.capacity}-capacity`);

  const fee = offerFeeLine(offer);
  if (fee) parts.push(fee);

  return parts;
}

export type OfferCardProps = {
  offer: PlayerOffer;
  /** The action, supplied by the page so this stays framework-neutral. */
  action?: ReactNode;
  className?: string;
};

/**
 * One offer, as it appears in a list.
 *
 * Deliberately identical whether the offer was authored or generated. A player
 * who could tell Thabo's introduction from Naledi's rooftop by the shape of the
 * card would be reading the implementation.
 */
export function OfferCard({ offer, action, className }: OfferCardProps) {
  const terms = termsOf(offer);
  const answered = offer.outcome !== "WAITING";

  return (
    <Surface
      level={1}
      padded="sm"
      data-offer-id={offer.id}
      className={cn("flex flex-col gap-3", answered && "opacity-80", className)}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex flex-col gap-1 min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-medium text-ink">{offer.source.name}</span>
            {offer.night?.nightName ? (
              <span className="text-sm text-ink-muted truncate">
                · {offer.night.nightName}
                {offer.night.sceneName ? ` · ${offer.night.sceneName}` : ""}
              </span>
            ) : null}
          </span>
          <span className="text-sm text-ink">{offer.headline}</span>
          {terms.length > 0 ? (
            <span className="text-sm text-ink-muted">{terms.join(" · ")}</span>
          ) : null}
        </span>

        {answered ? (
          <Tag>{offer.outcomeLabel}</Tag>
        ) : offer.answerByLabel ? (
          <span className="text-2xs uppercase tracking-label text-ink-subtle whitespace-nowrap">
            {offer.answerByLabel}
          </span>
        ) : null}
      </div>

      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </Surface>
  );
}

export type OfferGroupBlockProps = {
  sharedNight: Date | null;
  children: ReactNode;
  className?: string;
};

/**
 * Two offers that want the same night, held together.
 *
 * The grouping is load-bearing rather than decorative. A clash has to be visible
 * *before* a destructive choice, and two cards a scroll apart are not visibly a
 * clash — so when a night is contested the offers share one bordered block with
 * the night named at the top and the consequence named at the bottom. On a phone
 * this is what keeps the comparison intact instead of compressing it side by
 * side.
 */
export function OfferGroupBlock({ sharedNight, children, className }: OfferGroupBlockProps) {
  if (!sharedNight) {
    return <div className={cn("flex flex-col gap-2", className)}>{children}</div>;
  }

  return (
    <Surface
      level={2}
      padded="sm"
      className={cn("flex flex-col gap-3 border-ember-line", className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{offerDate(sharedNight)}</span>
        <Label>Both of these want this night</Label>
      </div>

      <div className="flex flex-col gap-2">{children}</div>

      <p className="text-sm text-ink-muted border-t border-line-subtle pt-3">
        Taking one means letting the other go.
      </p>
    </Surface>
  );
}

/**
 * An offer that is over, rendered where it was.
 *
 * Replaced in place rather than silently removed, because a card that vanishes
 * between one navigation and the next reads as a bug. The player is told what
 * happened to it and by what, in that order.
 */
export function OfferOutcomeNote({
  offer,
  action,
}: {
  offer: PlayerOffer;
  action?: ReactNode;
}) {
  return (
    <Surface level={1} padded="sm" className="flex flex-col gap-2" data-offer-id={offer.id}>
      <Label>{offer.outcomeLabel}</Label>
      <p className="text-base text-ink">{outcomeSentence(offer)}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </Surface>
  );
}

/**
 * What happened, in a sentence with a subject.
 *
 * The four endings stay four. "You turned it down" and "they stopped waiting"
 * have different subjects, and the difference between them is most of what makes
 * a career feel like a sequence of decisions rather than a list of closed rows.
 */
export function outcomeSentence(offer: PlayerOffer): string {
  const what = offer.night?.nightName ?? offer.headline;

  switch (offer.outcome) {
    case "TAKEN":
      return offer.type === "SESSION_INVITE"
        ? `You're going back in with ${offer.source.name}.`
        : `You took ${what}.`;
    case "TURNED_DOWN":
      return `You turned this one down.`;
    case "LAPSED":
      return `${offer.source.name} stopped waiting.`;
    case "GONE":
      return offer.displacedBy
        ? `You took ${offer.displacedBy.what} the same night.`
        : `You took something else that night.`;
    case "WAITING":
      return `${offer.source.name} is waiting on an answer.`;
  }
}
