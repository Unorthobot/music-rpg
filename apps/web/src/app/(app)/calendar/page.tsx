import Link from "next/link";
import { getCareerCalendar } from "@music-rpg/domain";
import { EmptyState, Label, Surface, Tag } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { createCommandContext } from "@/lib/command-context";
import { ACT_LABELS, requireCareer } from "@/lib/career";

export const metadata = { title: "Calendar" };

/**
 * The career in time.
 *
 * Deliberately a list, not a scheduling application: what matters at this point
 * is that the player understands their career happens on in-world dates, and
 * that the session they paid for is really booked.
 */
export default async function CalendarPage() {
  const { user, view } = await requireCareer();
  const db = await getAppDb();
  const calendar = await getCareerCalendar(db, view.career);

  const ctx = await createCommandContext();
  await ctx.analytics.track({
    name: "calendar_viewed",
    userId: user.id,
    careerId: view.career.id,
    properties: { upcoming: calendar.upcoming.length, past: calendar.past.length },
  });

  const formatDate = (value: Date) =>
    new Date(value).toLocaleDateString("en-ZA", {
      weekday: "short",
      day: "numeric",
      month: "long",
    });

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Calendar"
      title="Calendar"
      context={
        <Surface level={1} padded="lg" className="flex flex-col gap-2">
          <Label>Today, in-world</Label>
          <p className="text-lg text-ink">{formatDate(calendar.careerDate)}</p>
          <p className="text-sm text-ink-muted">
            Time moves when your career does — not while you&apos;re away.
          </p>
        </Surface>
      }
      contextLabel="In-world date"
    >
      <section className="flex flex-col gap-3">
        <Label>Coming up</Label>
        {calendar.upcoming.length === 0 ? (
          <EmptyState
            eyebrow="Calendar"
            title="Nothing scheduled."
            description="Sessions, shows and deadlines land here as soon as there is something to schedule."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {calendar.upcoming.map((item) => {
              const isSession = item.relatedEntityType === "CREATIVE_SESSION";
              const body = (
                <Surface
                  level={1}
                  padded="sm"
                  className="flex items-start justify-between gap-4 hover:border-line-strong transition-colors duration-fast"
                >
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <Tag tone="ember">{item.type.toLowerCase()}</Tag>
                      {item.status === "ACTIVE" ? <Tag>In progress</Tag> : null}
                    </span>
                    <span className="text-base text-ink">{item.title}</span>
                    {item.description ? (
                      <span className="text-sm text-ink-muted">{item.description}</span>
                    ) : null}
                  </span>
                  <time className="text-xs text-ink-subtle whitespace-nowrap">
                    {formatDate(item.startGameTime)}
                  </time>
                </Surface>
              );

              return (
                <li key={item.id}>
                  {isSession ? (
                    <Link href={`/studio/session/${item.relatedEntityId}`} className="block">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {calendar.past.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Label>Done</Label>
          <ul className="flex flex-col gap-2">
            {calendar.past.map((item) => (
              <li key={item.id}>
                <Surface
                  level={1}
                  padded="sm"
                  className="flex items-start justify-between gap-4 opacity-70"
                >
                  <span className="flex flex-col gap-1 min-w-0">
                    <Label>{item.status.toLowerCase()}</Label>
                    <span className="text-base text-ink">{item.title}</span>
                  </span>
                  <time className="text-xs text-ink-subtle whitespace-nowrap">
                    {formatDate(item.startGameTime)}
                  </time>
                </Surface>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
