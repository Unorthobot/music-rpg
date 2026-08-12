import Link from "next/link";
import { getNotifications } from "@music-rpg/domain";
import { EmptyState, Surface, Tag } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { ACT_LABELS, requireCareer } from "@/lib/career";

export const metadata = { title: "Notifications" };

/**
 * What happened while you were away.
 *
 * Awareness only. Every line here points at something that lives somewhere
 * else — a message, an offer, a booking — and none of it is state in its own
 * right. Losing this whole screen would cost the player a prompt and nothing
 * more, which is the test a notification system should be able to pass.
 */
export default async function NotificationsPage() {
  const { view } = await requireCareer();
  const db = await getAppDb();
  const notifications = await getNotifications(db, view.career);

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Notifications"
      title="Notifications"
    >
      {notifications.length === 0 ? (
        <EmptyState
          eyebrow="Notifications"
          title="Nothing has happened while you were gone."
          description="Once people start getting in touch, this is where you find out what changed — good and bad."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((entry) => (
            <li key={entry.id}>
              <Link href={entry.href} className="block">
                <Surface
                  level={1}
                  padded="sm"
                  className="flex items-start justify-between gap-4 hover:border-line-strong transition-colors duration-fast"
                >
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="text-base text-ink">{entry.line}</span>
                    {entry.tone === "ASKING" ? <Tag tone="ember">Waiting on you</Tag> : null}
                  </span>
                  <time className="text-2xs uppercase tracking-label text-ink-subtle whitespace-nowrap">
                    {new Date(entry.occurredAt).toLocaleDateString("en-ZA", {
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                </Surface>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
