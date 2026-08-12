import Link from "next/link";
import { notFound } from "next/navigation";
import { getCareerCalendar, getOffer } from "@music-rpg/domain";
import { formatMoney, type PlayerOffer } from "@music-rpg/shared";
import {
  Button,
  Label,
  LinkButton,
  Surface,
  Tag,
  offerDate,
  outcomeSentence,
} from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { ACT_LABELS, requireCareer } from "@/lib/career";
import { acceptOfferAction, declineOfferAction } from "./actions";
import { AcceptWithConflict } from "./confirm";

export const metadata = { title: "Offer" };

/**
 * What exactly is being asked.
 *
 * The one screen in this milestone whose whole job is a decision, and the only
 * information on it is what a person deciding would need: who is asking, which
 * room, which night, which end of the bill, what it pays, what else is that
 * week, and how long there is. Nothing about why the world thinks this career
 * qualifies, because the player has been *offered something* — they have not
 * been assessed, and telling them the score behind the offer would turn a
 * promoter into a scoreboard.
 *
 * **This page writes nothing.** Opening it does not create, expire, withdraw or
 * communicate anything; the two forms below are the only things here that change
 * the world, and they are player decisions.
 */
export default async function OfferPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const { view } = await requireCareer();
  const db = await getAppDb();

  const offer = await getOffer(db, view.career, params.id);
  if (!offer) notFound();

  const calendar = await getCareerCalendar(db, view.career);
  const waiting = offer.outcome === "WAITING";
  const clash = offer.competingWith[0] ?? null;

  /*
   * What else is that week, read from the Calendar rather than asserted. A
   * promoter's night is only free if the career's own commitments say it is, and
   * the player should be looking at the same calendar the director did.
   */
  const sameWeek = offer.night
    ? calendar.upcoming.filter((item) => withinDays(item.startGameTime, offer.night!.at, 3))
    : [];

  const context = (
    <>
      {offer.night ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-2">
          <Label>The night</Label>
          <p className="text-lg text-ink">{offerDate(offer.night.at)}</p>
          {offer.night.capacity ? (
            <p className="text-sm text-ink-muted">
              A {offer.night.capacity}-capacity room
              {offer.night.sceneName ? ` in ${offer.night.sceneName}` : ""}
            </p>
          ) : null}
          <p className="text-sm text-ink-muted">{offer.headline}</p>
        </Surface>
      ) : null}

      <Surface level={1} padded="lg" className="flex flex-col gap-2">
        <Label>What else is that week</Label>
        {sameWeek.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing. The night is free.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sameWeek.map((item) => (
              <li key={item.id} className="text-sm text-ink">
                {item.title}
                <span className="block text-xs text-ink-subtle">
                  {offerDate(item.startGameTime)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      {/*
        The clash, comparable. On desktop this sits in the context rail so both
        offers are on screen at once; on a phone it is the block below, stacked
        under the terms and above the sticky actions.
      */}
      {clash ? (
        <Surface level={2} padded="lg" className="hidden xl:flex flex-col gap-3 border-ember-line">
          <Label>Something else wants that night</Label>
          <p className="text-base text-ink">
            {clash.who} has {clash.what.toLowerCase()} the same night.
          </p>
          <p className="text-sm text-ink-muted">Taking this one ends that one.</p>
          <LinkButton href={`/opportunities/${clash.offerId}`} variant="secondary">
            Compare them
          </LinkButton>
        </Surface>
      ) : null}
    </>
  );

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow={offer.source.name}
      title={offer.headline}
      context={context}
      contextLabel="The night"
    >
      {searchParams.error ? (
        <p role="alert" className="text-sm text-danger">
          {searchParams.error}
        </p>
      ) : null}

      {offer.source.conversationId ? (
        <Link
          href={`/messages/${offer.source.conversationId}`}
          className="text-sm text-ink-muted hover:text-ink min-h-[44px] inline-flex items-center"
        >
          ← {offer.source.name}
        </Link>
      ) : (
        <Link
          href="/home"
          className="text-sm text-ink-muted hover:text-ink min-h-[44px] inline-flex items-center"
        >
          ← Home
        </Link>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tracking-display">{offer.headline}</span>
          {offer.night?.nightName ? (
            <span className="text-sm text-ink-muted">
              {offer.night.nightName}
              {offer.night.sceneName ? ` · ${offer.night.sceneName}` : ""}
            </span>
          ) : null}
        </div>

        {offer.offerLine ? (
          <Surface level={1} padded="lg" className="flex flex-col gap-2">
            <p className="text-base text-ink border-l-2 border-ember-line pl-4">
              “{offer.offerLine}”
            </p>
            <p className="text-sm text-ink-subtle pl-4">— {offer.source.name}</p>
          </Surface>
        ) : null}
      </section>

      {offer.night ? (
        <section className="flex flex-col gap-3">
          <Label>The night</Label>
          <Surface level={1} padded="lg" className="flex flex-col gap-1">
            <p className="text-base text-ink">{offerDate(offer.night.at)}</p>
            {offer.night.capacity ? (
              <p className="text-sm text-ink-muted">
                A {offer.night.capacity}-capacity room
                {offer.night.sceneName ? ` in ${offer.night.sceneName}` : ""}
              </p>
            ) : null}
            <p className="text-sm text-ink-muted">{offer.headline}</p>
          </Surface>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <Label>The terms</Label>
        <Surface level={1} padded="lg" className="flex flex-col gap-1">
          {offer.feeMinor !== null ? (
            <p className="text-base text-ink">
              {offer.feeDirection === "COSTS"
                ? `${formatMoney(offer.feeMinor)} — your cost, from your balance`
                : offer.feeMinor === 0
                  ? "A split of the door"
                  : `${formatMoney(offer.feeMinor)}, paid on the night`}
            </p>
          ) : null}
          {offer.termsLine ? <p className="text-sm text-ink-muted">{offer.termsLine}</p> : null}
          {offer.feeDirection === "COSTS" ? (
            <p className="text-sm text-ink-subtle pt-1">
              You have {formatMoney(view.career.moneyBalance)}.
            </p>
          ) : null}
        </Surface>
      </section>

      {/* The clash, on every viewport. On a phone this is where it lives. */}
      {clash ? (
        <section className="flex flex-col gap-3 xl:hidden">
          <Label>Something else wants that night</Label>
          <Surface level={2} padded="lg" className="flex flex-col gap-3 border-ember-line">
            <p className="text-base text-ink">
              {clash.who} has {clash.what.toLowerCase()} the same night.
            </p>
            <p className="text-sm text-ink-muted">Taking this one ends that one.</p>
            <LinkButton href={`/opportunities/${clash.offerId}`} variant="secondary">
              Compare them
            </LinkButton>
          </Surface>
        </section>
      ) : null}

      {waiting ? (
        <>
          {offer.answerByLabel ? (
            <p className="text-sm text-ink-muted">{offer.answerByLabel}.</p>
          ) : null}

          {/*
            Sticky at the bottom on a phone, because the terms will scroll past
            the fold and no decision may require a desktop.
          */}
          <section className="sticky bottom-0 -mx-gutter px-gutter py-4 bg-canvas border-t border-line-subtle md:static md:mx-0 md:px-0 md:py-0 md:border-0">
            <div className="flex flex-wrap items-center gap-3">
              <form action={acceptOfferAction}>
                <input type="hidden" name="opportunityId" value={offer.id} />
                {clash ? (
                  <AcceptWithConflict
                    takeLabel={takeLabel(offer)}
                    title={`This means turning down ${clash.who}'s offer.`}
                    explanation={`Both are on ${offerDate(clash.night)}. If you take ${takeLabel(
                      offer,
                    ).replace(/^Take /, "")}, you won't be available for ${clash.who}'s.`}
                  >
                    <Button type="submit" size="lg">
                      {takeLabel(offer)}
                    </Button>
                  </AcceptWithConflict>
                ) : (
                  <Button type="submit" size="lg">
                    {takeLabel(offer)}
                  </Button>
                )}
              </form>

              <form action={declineOfferAction}>
                <input type="hidden" name="opportunityId" value={offer.id} />
                <Button type="submit" variant="ghost">
                  Turn it down
                </Button>
              </form>
            </div>
          </section>
        </>
      ) : (
        <section className="flex flex-col gap-3">
          <Label>{offer.outcomeLabel}</Label>
          <Surface level={1} padded="lg" className="flex flex-col gap-3">
            <p className="text-lg text-ink">{outcomeSentence(offer)}</p>

            <div className="flex flex-wrap gap-2">
              {/*
                Terminal states replace the actions with a route onward, so no
                offer is ever a dead end: taken points at the commitment,
                displaced points at what displaced it, and everything else points
                back at the person.
              */}
              {offer.sessionId ? (
                <LinkButton href={`/studio/session/${offer.sessionId}`}>
                  Go to the session
                </LinkButton>
              ) : offer.calendarItemId ? (
                <LinkButton href="/calendar">See it on your calendar</LinkButton>
              ) : null}

              {offer.displacedBy ? (
                <LinkButton href={`/opportunities/${offer.displacedBy.offerId}`} variant="secondary">
                  See what you took
                </LinkButton>
              ) : null}

              {offer.source.conversationId ? (
                <LinkButton href={`/messages/${offer.source.conversationId}`} variant="secondary">
                  Back to {offer.source.name}
                </LinkButton>
              ) : null}
            </div>
          </Surface>
        </section>
      )}

      {/*
        The competing offer in full, so "compare them" is a real comparison of
        two rooms rather than a link away from the decision. Only what differs:
        the room, the fee, the terms, the billing, the answer-by.
      */}
      {clash ? (
        <section className="flex flex-col gap-3">
          <Label>The other offer</Label>
          <CompetingSummary offerId={clash.offerId} who={clash.who} what={clash.what} />
        </section>
      ) : null}
    </AppShell>
  );
}

/** The primary action names what is being taken, never the operation. */
function takeLabel(offer: PlayerOffer): string {
  if (offer.type === "SESSION_INVITE") return `Book it with ${offer.source.name}`;
  if (offer.night?.nightName) return `Take ${offer.source.name}'s slot`;
  return "Take it";
}

function withinDays(candidate: Date, anchor: Date, days: number): boolean {
  const difference = Math.abs(new Date(candidate).getTime() - new Date(anchor).getTime());
  return difference <= days * 24 * 60 * 60 * 1000;
}

/** A quiet pointer at the other offer. The comparison itself is its own page. */
function CompetingSummary({
  offerId,
  who,
  what,
}: {
  offerId: string;
  who: string;
  what: string;
}) {
  return (
    <Link href={`/opportunities/${offerId}`} className="block">
      <Surface
        level={1}
        padded="sm"
        className="flex items-center justify-between gap-4 hover:border-line-strong transition-colors duration-fast"
      >
        <span className="flex flex-col gap-1 min-w-0">
          <span className="text-base text-ink">{who}</span>
          <span className="text-sm text-ink-muted">{what}</span>
        </span>
        <Tag>Same night</Tag>
      </Surface>
    </Link>
  );
}
