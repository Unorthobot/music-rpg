import Link from "next/link";
import { getStudioHome } from "@music-rpg/domain";
import { Button, EmptyState, Label, LinkButton, Surface, Tag, TrackCard } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { createCommandContext } from "@/lib/command-context";
import { ACT_LABELS, requireCareer } from "@/lib/career";
import { startSessionAction } from "./actions";

export const metadata = { title: "Studio" };

/**
 * Studio home.
 *
 * One primary thing to do, whatever is unfinished, and everything you've made.
 * The empty state is honest: without a producer there is no session, and the
 * way to get one is through people, not a button here.
 */
export default async function StudioPage() {
  const { user, view } = await requireCareer();
  const db = await getAppDb();
  const studio = await getStudioHome(db, view.career);

  const ctx = await createCommandContext();
  await ctx.analytics.track({
    name: "studio_home_viewed",
    userId: user.id,
    careerId: view.career.id,
    properties: { tracks: studio.tracks.length, hasActive: Boolean(studio.activeSession) },
  });

  const active = studio.activeSession;

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Studio"
      title="Studio"
    >
      {active ? (
        <Surface level={2} padded="lg" className="flex flex-col gap-3 border-ember-line bg-ember-soft">
          <Label>{active.status === "SCHEDULED" ? "Booked" : "In progress"}</Label>
          <p className="text-xl md:text-2xl font-semibold tracking-display">
            {active.status === "SCHEDULED"
              ? `Session with ${active.producerName} is ready.`
              : `You're mid-session with ${active.producerName}.`}
          </p>
          <p className="text-sm text-ink-muted">
            {active.status === "SCHEDULED"
              ? "Paid for and waiting. Nothing happens until you walk in."
              : "The room is exactly as you left it."}
          </p>
          <div className="pt-1">
            {active.status === "SCHEDULED" ? (
              <form action={startSessionAction}>
                <input type="hidden" name="sessionId" value={active.id} />
                <Button type="submit" size="lg">
                  Start the session
                </Button>
              </form>
            ) : (
              <LinkButton href={`/studio/session/${active.id}`} size="lg">
                Continue working
              </LinkButton>
            )}
          </div>
        </Surface>
      ) : (
        <EmptyState
          eyebrow="Sessions"
          title={
            studio.tracks.length === 0
              ? "Your first session starts here."
              : "No session booked."
          }
          description="Sessions come from producers, and producers come from people who know you. Check your messages."
          action={<LinkButton href="/messages" variant="secondary">Open messages</LinkButton>}
        />
      )}

      <section className="flex flex-col gap-3">
        <Label>Tracks — {studio.tracks.length}</Label>
        {studio.tracks.length === 0 ? (
          <TrackCard title="No tracks yet" artistName={view.displayName} state="LOCKED" />
        ) : (
          <ul className="flex flex-col gap-2">
            {studio.tracks.map((trackRow) => (
              <li key={trackRow.id}>
                <Surface level={1} padded="sm" className="flex items-center justify-between gap-4">
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="text-base text-ink truncate">
                      {trackRow.title ?? "Untitled"}
                    </span>
                    <span className="text-xs text-ink-subtle">
                      {trackRow.versionCount} {trackRow.versionCount === 1 ? "version" : "versions"}
                      {trackRow.ownerType === "GROUP" ? " · group" : ""}
                    </span>
                  </span>
                  <Tag tone={trackRow.status === "UNRELEASED" ? "ember" : "neutral"}>
                    {trackRow.status.replace("_", " ").toLowerCase()}
                  </Tag>
                </Surface>
              </li>
            ))}
          </ul>
        )}
      </section>

      {studio.recentSessions.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Label>Recent sessions</Label>
          <ul className="flex flex-col gap-2">
            {studio.recentSessions.map((session) => (
              <li key={session.id}>
                <Link href={`/studio/session/${session.id}`} className="block">
                  <Surface
                    level={1}
                    padded="sm"
                    className="flex items-center justify-between gap-4 hover:border-line-strong transition-colors duration-fast"
                  >
                    <span className="text-sm text-ink">With {session.producerName}</span>
                    <time className="text-xs text-ink-subtle">
                      {session.endedAt
                        ? new Date(session.endedAt).toLocaleDateString("en-ZA", {
                            day: "numeric",
                            month: "short",
                          })
                        : ""}
                    </time>
                  </Surface>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
