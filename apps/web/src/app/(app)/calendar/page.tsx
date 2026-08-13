import Link from "next/link";
import { getCalendarBattles, getCalendarOffers, getCareerCalendar } from "@music-rpg/domain";
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
  const [calendar, offers, battlesByItem] = await Promise.all([
    getCareerCalendar(db, view.career),
    /*
     * The offer behind each booking, so causality reads backwards: from a night
     * on the calendar to the offer it came from, from there to the message, and
     * from the message to the person. A calendar entry that cannot be traced
     * back is a row with a title on it.
     */
    getCalendarOffers(db, view.career),
    /*
     * And the battle behind a night that is one, for the same reason. The
     * Calendar answers *when does it happen* and nothing else — it grows no
     * battle-specific controls, no angle picker and no preparation button. It
     * says which night this is and points at where those decisions live.
     */
    getCalendarBattles(db, view.career),
  ]);

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
              const offer = offers.get(item.id) ?? null;
              const battle = battlesByItem.get(item.id) ?? null;

              const body = (
                <Surface
                  level={1}
                  padded="sm"
                  className="flex items-start justify-between gap-4 hover:border-line-strong transition-colors duration-fast"
                >
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <Tag tone="ember">{item.type.toLowerCase()}</Tag>
                      {item.status === "ACTIVE" ? <Tag>In progress</Tag> : <Tag>Booked</Tag>}
                    </span>
                    <span className="text-base text-ink">{item.title}</span>
                    {/*
                      Who, what and where, from the offer this came from rather
                      than parsed back out of the title.
                    */}
                    {offer ? (
                      <span className="text-sm text-ink-muted">
                        {[offer.source.name, offer.headline].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                    {battle ? (
                      <span className="text-sm text-ink-muted">
                        {[battle.rival.name, battle.night.venueName].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
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
                <li key={item.id} className="flex flex-col gap-1">
                  {isSession ? (
                    <Link href={`/studio/session/${item.relatedEntityId}`} className="block">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}

                  {offer ? (
                    <Link
                      href={`/opportunities/${offer.id}`}
                      className="self-start text-sm text-ember underline underline-offset-4 min-h-[44px] inline-flex items-center"
                    >
                      The offer
                    </Link>
                  ) : null}

                  {battle ? (
                    <Link
                      href={battle.href}
                      className="self-start text-sm text-ember underline underline-offset-4 min-h-[44px] inline-flex items-center"
                    >
                      {battle.stage === "DECIDED" ? "What they decided" : "The night"}
                    </Link>
                  ) : null}
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
            {calendar.past.map((item) => {
              const battle = battlesByItem.get(item.id) ?? null;

              return (
                <li key={item.id} className="flex flex-col gap-1">
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

                  {/*
                    A night that happened still points at what came of it — the
                    same battle, by the same id, as the notification and the
                    route and Career's memory of it.
                  */}
                  {battle && battle.stage === "DECIDED" ? (
                    <Link
                      href={battle.href}
                      className="self-start text-sm text-ember underline underline-offset-4 min-h-[44px] inline-flex items-center"
                    >
                      What they decided
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
