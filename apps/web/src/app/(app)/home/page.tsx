import Link from "next/link";
import { formatCount, formatMoney } from "@music-rpg/shared";
import {
  getCareerCounters,
  getCareerHome,
  getCareerPulse,
  getHomeReception,
  getOfferStory,
} from "@music-rpg/domain";
import {
  AwaitingReception,
  Button,
  CareerMetric,
  Label,
  LinkButton,
  OfferCard,
  OfferGroupBlock,
  OfferOutcomeNote,
  PulseMetric,
  ReceptionHeadline,
  Surface,
} from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { createCommandContext } from "@/lib/command-context";
import { ACT_LABELS, ACT_LINES, requireCareer } from "@/lib/career";
import { advanceDayAction } from "./actions";

export const metadata = { title: "Home" };

/**
 * Career HQ.
 *
 * Where am I, what is happening, what should I care about right now — in that
 * order, and every answer read from state.
 *
 * Home creates nothing. It used to trigger first contact on render, which was
 * idempotent and so never visibly wrong, but it made a screen the author of a
 * world fact. Opening this page ten times shows the same world ten times because
 * there is nothing here that could change it: new opportunities arrive from
 * entering The Underground and from letting a day pass, and this page reveals
 * what already happened.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { user, view } = await requireCareer();
  const act = view.career.careerAct;
  const ctx = await createCommandContext();

  const db = await getAppDb();
  const [counters, home, reception, pulse, offerStory] = await Promise.all([
    getCareerCounters(db, view.career),
    getCareerHome(db, view.career),
    getHomeReception(db, view.career),
    getCareerPulse(db, view.career),
    getOfferStory(db, view.career, 4),
  ]);

  await ctx.analytics.track({
    name: "home_viewed",
    userId: user.id,
    careerId: view.career.id,
    properties: { act, rightNow: home.rightNow.kind },
  });
  await ctx.analytics.track({
    name: "home_right_now_viewed",
    userId: user.id,
    careerId: view.career.id,
    properties: { kind: home.rightNow.kind },
  });

  const levelOf = (key: "FAME" | "RESPECT" | "HEAT" | "LEGACY"): string =>
    pulse.metrics.find((metric) => metric.key === key)?.level ?? "";

  const isFirstView =
    view.career.onboardingCompletedAt &&
    Date.now() - new Date(view.career.onboardingCompletedAt).getTime() < 60_000;

  if (isFirstView) {
    await ctx.analytics.track({
      name: "home_first_viewed",
      userId: user.id,
      careerId: view.career.id,
    });
  }

  const context = (
    <>
      <Surface level={1} padded="lg" className="flex flex-col gap-2">
        <Label>Act</Label>
        <p className="text-lg font-semibold tracking-display">{ACT_LABELS[act]}</p>
        <p className="text-sm text-ink-muted">{ACT_LINES[act]}</p>
        <p className="text-xs text-ink-subtle mt-2">
          {new Date(view.career.currentGameDate).toLocaleDateString("en-ZA", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}{" "}
          in {view.world.name}
        </p>
      </Surface>

      <Surface level={1} padded="lg" className="flex flex-col gap-3">
        <Label>Career pulse</Label>

        {/*
          What the last week did to the career. Standing is shown as a state and
          a direction rather than an integer — the number is the simulation's,
          and "Respect 4" would send a player looking for the formula behind it.
        */}
        {!pulse.quiet ? (
          <>
            <p className="text-sm text-ink">
              +{pulse.fansGained} {pulse.fansGained === 1 ? "fan" : "fans"} ·{" "}
              {formatCount(pulse.newListeners)}{" "}
              {pulse.newListeners === 1 ? "listener" : "listeners"}
            </p>
            <div className="border-t border-line-subtle pt-1">
              {pulse.metrics.map((metric) => (
                <PulseMetric
                  key={metric.key}
                  label={metric.label}
                  level={metric.level}
                  movementLabel={metric.movementLabel}
                  moved={metric.movement !== "UNCHANGED"}
                  tone={
                    metric.key === "FAME"
                      ? "fame"
                      : metric.key === "RESPECT"
                        ? "respect"
                        : metric.key === "HEAT"
                          ? "heat"
                          : "legacy"
                  }
                />
              ))}
            </div>
          </>
        ) : null}

        <ul className="flex flex-col gap-2 text-sm text-ink-muted border-t border-line-subtle pt-3">
          <li className="flex justify-between gap-3">
            <span>Spent</span>
            <span className="text-ink tabular-nums">{formatMoney(home.pulse.spentMinor)}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span>Studio sessions</span>
            <span className="text-ink tabular-nums">
              {home.pulse.sessionsCompleted} / {home.pulse.sessionsBooked}
            </span>
          </li>
          <li className="flex justify-between gap-3">
            <span>Tracks created</span>
            <span className="text-ink tabular-nums">{home.pulse.tracksCreated}</span>
          </li>
        </ul>
        {home.nextCalendarItem ? (
          <p className="text-xs text-ink-subtle border-t border-line-subtle pt-3">
            Next: {home.nextCalendarItem.title} —{" "}
            {new Date(home.nextCalendarItem.startGameTime).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "short",
            })}
          </p>
        ) : null}
      </Surface>
    </>
  );

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[act]}
      eyebrow={ACT_LABELS[act]}
      title={view.displayName}
      context={context}
      contextLabel="Career context"
    >
      {searchParams.error ? (
        <p role="alert" className="text-sm text-danger">
          {searchParams.error}
        </p>
      ) : null}

      {/*
        Reception leads Home once something is out: what changed is the most
        important thing a player can be told, and it changes on its own schedule
        rather than theirs.
      */}
      {reception ? (
        <section className="flex flex-col gap-3">
          <Label>Your record</Label>

          {reception.awaitingFirstDay ? (
            <AwaitingReception title={reception.release.title} />
          ) : (
            <ReceptionHeadline
              headline={reception.release.headline}
              detail={reception.release.detail}
              insight={reception.release.insight}
              figures={[
                {
                  label: "Unique listeners",
                  value: formatCount(reception.release.uniqueListeners),
                },
                { label: "New fans", value: formatCount(reception.release.fansGained) },
                { label: "Days out", value: String(reception.release.daysOut) },
              ]}
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <form action={advanceDayAction}>
              <Button type="submit">Let a day pass</Button>
            </form>
            {reception.release.trackId ? (
              <Link
                href={`/catalogue/${reception.release.trackId}`}
                className="text-sm text-ember underline underline-offset-4 min-h-[44px] inline-flex items-center"
              >
                See how it&rsquo;s landing
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <Label>Right now</Label>
        <Surface
          level={2}
          padded="lg"
          className="flex flex-col gap-3 border-ember-line bg-ember-soft"
        >
          <p className="text-xl md:text-2xl font-semibold tracking-display text-balance">
            {home.rightNow.title}
          </p>
          <p className="text-sm text-ink-muted max-w-[60ch]">{home.rightNow.detail}</p>
          <div className="pt-1">
            <LinkButton href={home.rightNow.href}>{home.rightNow.cta}</LinkButton>
          </div>
        </Surface>
      </section>

      {/*
        On the table.

        Contextual, not structural: Home *gains* this section when the career has
        live offers and *loses* it when it does not. There is no empty state and
        there must never be one — rendering an offers area with nothing in it
        tells the player the world has a slot they have failed to fill, which is
        the same violation as greying out a locked one. A career with nothing
        waiting has a shorter Home, not an emptier one.

        It sits beneath "Right now" because that is the single most pressing
        thing and this is everything that is waiting.
      */}
      {home.onTheTable.count > 0 || home.onTheTable.recentlyEnded.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <Label>On the table</Label>
            {/* Never "3 of 3". The cap is not player-facing. */}
            {home.onTheTable.count > 0 ? (
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                {home.onTheTable.count} {home.onTheTable.count === 1 ? "offer" : "offers"}
              </span>
            ) : null}
          </div>

          <ul className="flex flex-col gap-3">
            {home.onTheTable.groups.map((group) => (
              <li key={group.offers[0]!.id}>
                <OfferGroupBlock sharedNight={group.sharedNight}>
                  {group.offers.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      action={
                        <LinkButton href={offer.href} variant="secondary">
                          Look at it
                        </LinkButton>
                      }
                    />
                  ))}
                </OfferGroupBlock>
              </li>
            ))}

            {/*
              A night that stopped being possible, said where the offer was. It
              is not removed silently — the player is told what happened and what
              displaced it — and it leaves on its own once the date passes.
            */}
            {home.onTheTable.recentlyEnded.map((offer) => (
              <li key={offer.id}>
                <OfferOutcomeNote
                  offer={offer}
                  action={
                    offer.displacedBy ? (
                      <LinkButton
                        href={`/opportunities/${offer.displacedBy.offerId}`}
                        variant="secondary"
                      >
                        See what you took
                      </LinkButton>
                    ) : (
                      <LinkButton href={offer.href} variant="secondary">
                        See the offer
                      </LinkButton>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <CareerMetric
          label="Balance"
          value={formatMoney(view.career.moneyBalance)}
          descriptor="Everything you have."
          tone="money"
        />
        <CareerMetric
          label="Fans"
          value={formatCount(counters.fans)}
          descriptor={counters.fans === 0 ? "Nobody yet." : "People who came back."}
          tone="neutral"
        />
        {/*
          The descriptor is the state, read from the same classification the
          pulse uses. It was a literal until M5 — correct only while every
          metric was nought, and a lie the moment one moved.
        */}
        <CareerMetric
          label="Fame"
          value={String(view.career.fame)}
          descriptor={levelOf("FAME")}
          tone="fame"
        />
        <CareerMetric
          label="Respect"
          value={String(view.career.respect)}
          descriptor={levelOf("RESPECT")}
          tone="respect"
        />
      </section>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <CareerMetric
          label="Heat"
          value={String(view.career.heat)}
          descriptor={levelOf("HEAT")}
          tone="heat"
        />
        <CareerMetric
          label="Legacy"
          value={String(view.career.legacy)}
          descriptor={levelOf("LEGACY")}
          tone="legacy"
        />
        <CareerMetric
          label="Catalogue"
          value={formatCount(counters.catalogue)}
          descriptor={counters.catalogue === 0 ? "No tracks." : "Yours."}
          tone="neutral"
        />
        <CareerMetric
          label="Battles"
          value={formatCount(counters.battles)}
          descriptor="Untested."
          tone="neutral"
        />
      </section>

      <section className="flex flex-col gap-3">
        <Label>Your story</Label>

        {/*
          What became of what was offered, with the four endings kept distinct.
          Above the general story because a decision the player made is more
          theirs than an event that happened to them.
        */}
        {offerStory.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {offerStory.map((entry) => (
              <li key={entry.id}>
                <Surface level={1} padded="sm" className="flex items-start justify-between gap-4">
                  <span className="flex flex-col gap-1 min-w-0">
                    <Label>{entry.eyebrow}</Label>
                    {entry.href ? (
                      <Link href={entry.href} className="text-base text-ink hover:text-ember">
                        {entry.line}
                      </Link>
                    ) : (
                      <span className="text-base text-ink">{entry.line}</span>
                    )}
                  </span>
                  <time className="text-2xs uppercase tracking-label text-ink-subtle whitespace-nowrap">
                    {new Date(entry.occurredAt).toLocaleDateString("en-ZA", {
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                </Surface>
              </li>
            ))}
          </ul>
        ) : null}

        {home.story.length === 0 && offerStory.length === 0 ? (
          <Surface level={1} padded="lg">
            <p className="text-lg text-ink">Every career starts somewhere.</p>
            <p className="text-sm text-ink-muted mt-2">
              {view.displayName} exists, has a sound, and has{" "}
              {formatMoney(view.career.moneyBalance)} in {view.world.name}. Nobody is listening yet.
            </p>
          </Surface>
        ) : (
          <ul className="flex flex-col gap-2">
            {home.story.map((card) => (
              <li key={card.id}>
                <Surface level={1} padded="sm" className="flex items-start justify-between gap-4">
                  <span className="flex flex-col gap-1 min-w-0">
                    <Label>{card.eyebrow}</Label>
                    <span className="text-base text-ink">{card.title}</span>
                    {card.detail ? (
                      <span className="text-sm text-ink-muted">{card.detail}</span>
                    ) : null}
                  </span>
                  <time className="text-2xs uppercase tracking-label text-ink-subtle whitespace-nowrap">
                    {new Date(card.occurredAt).toLocaleDateString("en-ZA", {
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                </Surface>
              </li>
            ))}
          </ul>
        )}
      </section>

      {home.unreadMessages > 0 ? (
        <Link
          href="/messages"
          className="text-sm text-ember underline underline-offset-4 min-h-[44px] inline-flex items-center"
        >
          {home.unreadMessages} unread {home.unreadMessages === 1 ? "message" : "messages"}
        </Link>
      ) : null}
    </AppShell>
  );
}
