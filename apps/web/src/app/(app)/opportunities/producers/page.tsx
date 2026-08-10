import { redirect } from "next/navigation";
import { getProducerOpportunity } from "@music-rpg/domain";
import { formatMoney } from "@music-rpg/shared";
import { Button, EmptyState, Label, Surface, Tag } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { createCommandContext } from "@/lib/command-context";
import { ACT_LABELS, requireCareer } from "@/lib/career";
import { selectProducerAction } from "./actions";

export const metadata = { title: "Producers" };

/**
 * Choosing who to work with.
 *
 * Each card shows only what the player could reasonably know from a first
 * meeting: what they sound like, what they're good at, how they work, what they
 * cost, and something they'd actually say. Personality, standards and the
 * numbers that shape their proposals stay hidden — the player is meeting
 * somebody, not reading a stat block.
 */
export default async function ProducersPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { user, view } = await requireCareer();
  const db = await getAppDb();
  const opportunity = await getProducerOpportunity(db, view.career);

  if (!opportunity) {
    return (
      <AppShell
        displayName={view.displayName}
        act={ACT_LABELS[view.career.careerAct]}
        eyebrow="Opportunity"
        title="Producers"
      >
        <EmptyState
          eyebrow="Nothing yet"
          title="Nobody has introduced you to anyone."
          description="Opportunities come from people. Give the scene a reason."
        />
      </AppShell>
    );
  }

  // Already chosen: the session is the thing that matters now, not the choice.
  if (opportunity.selectedProducerId) redirect("/studio");

  const ctx = await createCommandContext();
  await ctx.analytics.track({
    name: "producer_opportunity_viewed",
    userId: user.id,
    careerId: view.career.id,
    properties: { options: opportunity.options.length },
  });

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Opportunity"
      title="WHO DO YOU WANT IN THE ROOM?"
      context={
        <Surface level={1} padded="lg" className="flex flex-col gap-2">
          <Label>Your balance</Label>
          <p className="text-2xl font-semibold tabular-nums">
            {formatMoney(opportunity.balanceMinor)}
          </p>
          <p className="text-sm text-ink-muted">
            One session is all you can afford right now. It comes out of your balance the moment you
            choose.
          </p>
        </Surface>
      }
      contextLabel="Balance"
    >
      {searchParams.error ? (
        <p role="alert" className="text-sm text-danger">
          {searchParams.error}
        </p>
      ) : null}

      <p className="text-base text-ink-muted max-w-[60ch]">
        Three producers are taking sessions. They will not make the same record with you.
      </p>

      <ul className="flex flex-col gap-4">
        {opportunity.options.map((option) => (
          <li key={option.character.id}>
            <Surface level={1} padded="lg" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-2xl font-semibold tracking-display">
                    {option.character.name}
                  </span>
                  <span className="text-xs text-ink-subtle">{option.character.origin}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-lg font-semibold tabular-nums">
                    {formatMoney(option.costMinor)}
                  </span>
                  <span className="text-2xs uppercase tracking-label text-ink-subtle">
                    per session
                  </span>
                </div>
              </div>

              <p className="text-sm text-ember">{option.soundLine}</p>

              {option.quote ? (
                <p className="text-base text-ink border-l-2 border-ember-line pl-4">
                  “{option.quote}”
                </p>
              ) : null}

              <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-3 text-sm">
                <div>
                  <dt className="text-2xs uppercase tracking-label text-ink-subtle">Strength</dt>
                  <dd className="text-ink">{option.strength}</dd>
                </div>
                <div>
                  <dt className="text-2xs uppercase tracking-label text-ink-subtle">Works like</dt>
                  <dd className="text-ink">{option.workingStyle}</dd>
                </div>
                <div>
                  <dt className="text-2xs uppercase tracking-label text-ink-subtle">Trade-off</dt>
                  <dd className="text-ink">{option.tradeOff}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <form action={selectProducerAction}>
                  <input type="hidden" name="producerId" value={option.character.id} />
                  <Button type="submit" disabled={!option.affordable}>
                    Book a session with {option.character.name}
                  </Button>
                </form>
                {!option.affordable ? (
                  <Tag>You can&apos;t afford this yet</Tag>
                ) : null}
              </div>
            </Surface>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
