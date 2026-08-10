import { formatCount, formatMoney } from "@music-rpg/shared";
import { listCareerEvents, gameEventLabels } from "@music-rpg/events";
import { getCareerCounters } from "@music-rpg/domain";
import {
  CareerMetric,
  EmptyState,
  Label,
  LinkButton,
  MissionCard,
  Surface,
  WorldEventCard,
} from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { createCommandContext } from "@/lib/command-context";
import { ACT_LABELS, ACT_LINES, requireCareer } from "@/lib/career";

export const metadata = { title: "Home" };

/**
 * Home.
 *
 * Reads real career state only: the money is the persisted balance, the metrics
 * are the four independent currencies, the history is the canonical event log.
 * The one thing that does not exist yet — missions — is shown as explicitly
 * inactive rather than mocked.
 */
export default async function HomePage() {
  const { user, view } = await requireCareer();
  const act = view.career.careerAct;

  const ctx = await createCommandContext();
  await ctx.analytics.track({
    name: "home_viewed",
    userId: user.id,
    careerId: view.career.id,
    properties: { act },
  });

  // "First view" is derived from persisted state, not a client-side flag.
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

  const db = await getAppDb();
  const [events, counters] = await Promise.all([
    listCareerEvents(db, view.career.id, 6),
    // Every counter below is read from a table. They are zero because the
    // simulation says zero, not because this file says zero.
    getCareerCounters(db, view.career),
  ]);
  const recent = [...events].reverse();

  const context = (
    <>
      <Surface level={1} padded="lg" className="flex flex-col gap-2">
        <Label>Act</Label>
        <p className="text-lg font-semibold tracking-display">{ACT_LABELS[act]}</p>
        <p className="text-sm text-ink-muted">{ACT_LINES[act]}</p>
      </Surface>

      <Surface level={1} padded="lg" className="flex flex-col gap-3">
        <Label>Career history</Label>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-subtle">Nothing has happened yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((event) => (
              <li key={event.id}>
                <WorldEventCard
                  label={gameEventLabels[event.eventType as keyof typeof gameEventLabels] ?? event.eventType}
                  timestamp={new Date(event.occurredAt).toLocaleDateString("en-ZA", {
                    day: "numeric",
                    month: "short",
                  })}
                  importance={event.importance}
                />
              </li>
            ))}
          </ul>
        )}
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
        <CareerMetric label="Fame" value={String(view.career.fame)} descriptor="Unknown." tone="fame" />
        <CareerMetric
          label="Respect"
          value={String(view.career.respect)}
          descriptor="Unearned."
          tone="respect"
        />
      </section>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <CareerMetric label="Heat" value={String(view.career.heat)} descriptor="Cold." tone="heat" />
        <CareerMetric
          label="Legacy"
          value={String(view.career.legacy)}
          descriptor="Not written."
          tone="legacy"
        />
        <CareerMetric
          label="Catalogue"
          value={formatCount(counters.catalogue)}
          descriptor={counters.releases === 0 ? "No releases." : `${counters.releases} released.`}
          tone="neutral"
        />
        <CareerMetric
          label="Battles"
          value={formatCount(counters.battles)}
          descriptor={counters.battles === 0 ? "Untested." : "On the record."}
          tone="neutral"
        />
      </section>

      <EmptyState
        eyebrow={ACT_LABELS[act]}
        title="Every career starts somewhere."
        description={`${view.displayName} exists, has a sound, and has ${formatMoney(
          view.career.moneyBalance,
        )} in ${view.world.name}. Nobody is listening yet. That is the entire problem, and the next milestone is where you start solving it.`}
        action={
          <LinkButton href="/career" variant="secondary">
            See your identity
          </LinkButton>
        }
      />

      <section className="flex flex-col gap-3">
        <Label>Next</Label>
        <MissionCard
          title="Your first move"
          summary="Story and missions arrive with the Studio milestone. Nothing here is playable yet — and nothing is pretending to be."
          status="LOCKED"
        />
      </section>
    </AppShell>
  );
}
