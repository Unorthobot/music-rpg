import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerBattle } from "@music-rpg/domain";
import {
  BATTLE_STRATEGIES,
  BATTLE_STRATEGY_INTENT,
  BATTLE_STRATEGY_LABELS,
  formatMoney,
  type PlayerBattle,
} from "@music-rpg/shared";
import { Button, Label, LinkButton, Surface, Tag, offerDate } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { ACT_LABELS, requireCareer } from "@/lib/career";
import { declareAngleAction, prepareAction, scoutAction } from "./actions";

export const metadata = { title: "The night" };

/**
 * One confrontation.
 *
 * A **situational surface**. It exists because a single active battle contains a
 * multi-day sequence of decisions and an explainable result, and it is not a
 * section of the game: there is no navigation item, no battle list, no history
 * screen and nothing anywhere that counts how many of these a career has had.
 * When there is no battle, this route is not reachable and nothing hints that it
 * could be.
 *
 * Two states, one route. Before the night it asks what the player is doing about
 * this; after it, it says what three people made of it.
 *
 * **This page writes nothing.** Opening it does not create, schedule, judge or
 * resolve anything — the forms below are the only things here that change the
 * world and every one of them is a player decision. In particular, opening this
 * page cannot make the battle happen: the night resolves on a day advance
 * because game time reached it, and a player who never opens this route still
 * finds the decision waiting when they arrive.
 */
export default async function BattlePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const { view } = await requireCareer();
  const db = await getAppDb();

  const battle = await getPlayerBattle(db, view.career, params.id);
  if (!battle) notFound();

  const decided = battle.decision !== null;

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow={battle.rival.name}
      title={decided ? "The night" : `${battle.rival.name}, ${offerDate(battle.night.at)}`}
      context={<TheNight battle={battle} />}
      contextLabel="The night"
    >
      {searchParams.error ? (
        <p role="alert" className="text-sm text-danger">
          {searchParams.error}
        </p>
      ) : null}

      {battle.rival.conversationId ? (
        <Link
          href={`/messages/${battle.rival.conversationId}`}
          className="text-sm text-ink-muted hover:text-ink min-h-[44px] inline-flex items-center"
        >
          ← {battle.rival.name}
        </Link>
      ) : (
        <Link
          href="/home"
          className="text-sm text-ink-muted hover:text-ink min-h-[44px] inline-flex items-center"
        >
          ← Home
        </Link>
      )}

      {decided ? <Decision battle={battle} /> : <BeforeTheNight battle={battle} />}
    </AppShell>
  );
}

/* ------------------------------------------------------------ before the night */

/**
 * What the player is doing about this.
 *
 * Read top to bottom in the order the decisions actually happen: find out what
 * you can, say how you are going in, then decide how much of the career to spend
 * on it. The angle sits above preparation because declaring it is the thing the
 * world is waiting for, and because preparing for a plan you have not chosen is
 * not preparation.
 */
function BeforeTheNight({ battle }: { battle: PlayerBattle }) {
  return (
    <>
      {battle.challengeLine ? (
        <section className="flex flex-col gap-3">
          <Surface level={1} padded="lg" className="flex flex-col gap-2">
            <p className="text-base text-ink border-l-2 border-ember-line pl-4">
              “{battle.challengeLine}”
            </p>
            <p className="text-sm text-ink-subtle pl-4">— {battle.rival.name}</p>
          </Surface>
        </section>
      ) : null}

      {/*
        Stated once, plainly, where the decision is. Not a warning and not a
        countdown — a fact about a night the player already agreed to, and the
        one thing still outstanding before the world can carry them into it.
      */}
      {battle.awaitingAngle ? (
        <Surface level={2} padded="lg" className="border-ember-line">
          <p className="text-base text-ink">{battle.awaitingAngleLine}</p>
        </Surface>
      ) : null}

      <Scouting battle={battle} />
      <TheAngle battle={battle} />
      <Preparation battle={battle} />
    </>
  );
}

/**
 * What is knowable, and what is not.
 *
 * Never a character sheet. Every insight is attributed to the provenance the
 * world genuinely owns — what you have heard, what the scene says, what has
 * passed between you, what happened in previous rooms — and *what you don't
 * know* is a section of its own rather than a footnote, because the most
 * important thing on this screen is that nobody declares an angle in advance.
 */
function Scouting({ battle }: { battle: PlayerBattle }) {
  if (!battle.scouting) {
    return (
      <section className="flex flex-col gap-3">
        <Label>Before the night</Label>
        <Surface level={1} padded="lg" className="flex flex-col gap-3">
          <p className="text-base text-ink">
            You could ask around about {battle.rival.name}.
          </p>
          {/*
            Said honestly. Scouting has no mechanical benefit and the interface
            must not imply one — it costs nothing, buys nothing, and exists so a
            person decides with better information rather than better odds.
          */}
          <p className="text-sm text-ink-muted">
            It won&rsquo;t change what happens in the room. It might change how you go into it.
          </p>
          <form action={scoutAction}>
            <input type="hidden" name="battleId" value={battle.id} />
            <Button type="submit" variant="secondary">
              Ask around
            </Button>
          </form>
        </Surface>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3" data-scouting>
      <Label>What you found out</Label>

      {battle.scouting.sections.map((section) => (
        <Surface key={section.heading} level={1} padded="lg" className="flex flex-col gap-2">
          <Label>{section.heading}</Label>
          {section.insights.map((insight) => (
            <p key={insight} className="text-base text-ink">
              {insight}
            </p>
          ))}
        </Surface>
      ))}

      {battle.scouting.unknowns.length > 0 ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-2">
          <Label>What you don&rsquo;t know</Label>
          {battle.scouting.unknowns.map((unknown) => (
            <p key={unknown} className="text-base text-ink-muted">
              {unknown}
            </p>
          ))}
        </Surface>
      ) : null}
    </section>
  );
}

/**
 * The angle.
 *
 * Three statements of intent. Never a modifier, never a percentage, never a
 * trade-off expressed as numbers — and deliberately chosen without knowing what
 * the other person is bringing, which is the whole design of the decision.
 *
 * The copy says *them* throughout. The world states pronouns for two of the
 * three rivals in prose and for one of them not at all, there is no structured
 * pronoun field anywhere, and inferring one from a name is how a game ends up
 * misgendering its own characters.
 */
function TheAngle({ battle }: { battle: PlayerBattle }) {
  if (battle.strategy) {
    return (
      <section className="flex flex-col gap-3">
        <Label>How you&rsquo;re going in</Label>
        <Surface level={1} padded="lg" className="flex flex-col gap-1">
          <p className="text-lg text-ink">{battle.strategyLabel}</p>
          <p className="text-sm text-ink-muted">{battle.strategyIntent}</p>
        </Surface>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <Label>How you&rsquo;re going in</Label>

      <ul className="flex flex-col gap-2">
        {BATTLE_STRATEGIES.map((strategy) => (
          <li key={strategy}>
            <form action={declareAngleAction}>
              <input type="hidden" name="battleId" value={battle.id} />
              <input type="hidden" name="strategy" value={strategy} />
              <button
                type="submit"
                className="w-full text-left min-h-[44px] rounded-lg border border-line-subtle bg-surface-1 p-4 flex flex-col gap-1 hover:border-line-strong transition-colors duration-fast"
              >
                <span className="text-base text-ink">{BATTLE_STRATEGY_LABELS[strategy]}</span>
                <span className="text-sm text-ink-muted">{BATTLE_STRATEGY_INTENT[strategy]}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>

      {/* One consequence statement, which is appropriate and sufficient. */}
      <p className="text-sm text-ink-subtle">
        You can&rsquo;t change your approach once preparation starts.
      </p>
    </section>
  );
}

/**
 * Preparation.
 *
 * The cost is stated as what it actually is: **days a record could have had**,
 * and the money those days cost. An interface showing only a fee would have
 * hidden the real price and turned a decision about the career into a purchase.
 *
 * Nothing here says what preparing buys. It sharpens what the artist can already
 * do; it does not hand them ability, and it has never been enough on its own —
 * so the honest copy is about work rather than about odds.
 */
function Preparation({ battle }: { battle: PlayerBattle }) {
  if (!battle.strategy) return null;

  const { sessions, maxSessions, spendMinor, daysCommitted, nextSessionCostMinor } =
    battle.preparation;

  return (
    <section className="flex flex-col gap-3">
      <Label>Putting work in</Label>
      <Surface level={1} padded="lg" className="flex flex-col gap-3">
        {sessions > 0 ? (
          <p className="text-base text-ink">
            {sessions === 1 ? "One session" : `${sessions} sessions`} on it so far —{" "}
            {daysCommitted === 1 ? "a day" : `${daysCommitted} days`} and{" "}
            {formatMoney(spendMinor)}.
          </p>
        ) : (
          <p className="text-base text-ink">You haven&rsquo;t put any work into this yet.</p>
        )}

        {nextSessionCostMinor !== null ? (
          <>
            <p className="text-sm text-ink-muted">
              Another session is a day in the studio and {formatMoney(nextSessionCostMinor)}.
              That&rsquo;s a day a record could have had.
            </p>
            <form action={prepareAction}>
              <input type="hidden" name="battleId" value={battle.id} />
              <Button type="submit" variant="secondary">
                Work on the round
              </Button>
            </form>
            {/*
              Said once, so nobody reads the section as a requirement. Going in
              cold is a legitimate choice about where this career's money and
              days are better spent.
            */}
            <p className="text-sm text-ink-subtle">
              You can go into it with nothing prepared.
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            You&rsquo;ve done as much as this is going to give.
          </p>
        )}
      </Surface>
    </section>
  );
}

/* --------------------------------------------------------------- the decision */

/**
 * What three people made of it.
 *
 * **Not a scorecard.** Three perspectives, stacked vertically at every width —
 * never side by side, never a table, never a compressed comparison row — each
 * saying who it went with and why. On desktop the stack breathes; it does not
 * rearrange, because the sequence is part of how the night reads.
 *
 * A 2–1 has to look like a 2–1. The dissent is marked so somebody who carried
 * one perspective can see that they were not simply beaten, which is the single
 * property the judging model was built to have.
 */
function Decision({ battle }: { battle: PlayerBattle }) {
  const decision = battle.decision!;

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-2xl font-semibold tracking-display">{decision.headline}</span>
          <span className="text-2xl text-ink-muted tabular-nums">{decision.tally}</span>
        </div>
        {decision.split ? (
          <p className="text-sm text-ink-muted">The panel didn&rsquo;t agree.</p>
        ) : null}
      </section>

      {/*
        The stack. `flex-col` with no responsive direction change anywhere, on
        purpose: three perspectives side by side become a comparison, and a
        comparison invites somebody to add them up.
      */}
      <section className="flex flex-col gap-3">
        {decision.perspectives.map((perspective) => (
          <Surface
            key={perspective.heading}
            level={1}
            padded="lg"
            className="flex flex-col gap-2"
          >
            <div className="flex items-baseline justify-between gap-4">
              <Label>{perspective.heading}</Label>
              <span className="text-sm uppercase tracking-label text-ink">
                {perspective.wentWith}
              </span>
            </div>
            <p className="text-base text-ink">{perspective.line}</p>
          </Surface>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <Label>Your round</Label>
        <Surface level={1} padded="lg">
          <p className="text-base text-ink">{decision.yourRound}</p>
        </Surface>
      </section>

      {/*
        The aftermath, in the world's own terms. There is no reward block here
        and no metric anywhere: standing moved where standing lives, and Home and
        Career show it where they already show it.
      */}
      <section className="flex flex-col gap-3">
        <Label>Afterwards</Label>
        <Surface level={1} padded="lg" className="flex flex-col gap-2">
          {decision.aftermath.map((line) => (
            <p key={line} className="text-base text-ink">
              {line}
            </p>
          ))}
        </Surface>

        <div className="flex flex-wrap gap-2">
          <LinkButton href="/world" variant="secondary">
            What the scene saw
          </LinkButton>
          {battle.rival.conversationId ? (
            <LinkButton href={`/messages/${battle.rival.conversationId}`} variant="secondary">
              {battle.rival.name}
            </LinkButton>
          ) : null}
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------- the rail */

/** Where and when, and nothing about how it will go. */
function TheNight({ battle }: { battle: PlayerBattle }) {
  return (
    <Surface level={1} padded="lg" className="flex flex-col gap-2">
      <Label>The night</Label>
      <p className="text-lg text-ink">{offerDate(battle.night.at)}</p>
      {battle.night.venueName ? (
        <p className="text-sm text-ink-muted">
          {battle.night.venueName}
          {battle.night.sceneName ? `, ${battle.night.sceneName}` : ""}
        </p>
      ) : null}
      {battle.night.capacity ? (
        <p className="text-sm text-ink-muted">A {battle.night.capacity}-capacity room</p>
      ) : null}
      {battle.termsLine ? <p className="text-sm text-ink-subtle">{battle.termsLine}</p> : null}
      <div className="pt-1">
        <Tag>{battle.stageLabel}</Tag>
      </div>
    </Surface>
  );
}
