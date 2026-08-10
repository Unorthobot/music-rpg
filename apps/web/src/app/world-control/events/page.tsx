import Link from "next/link";
import { desc } from "drizzle-orm";
import { gameEvents } from "@music-rpg/database";
import { gameEventLabels } from "@music-rpg/events";
import { Label } from "@music-rpg/ui";
import { getAppDb } from "@/lib/db";

/** The canonical log across every world, newest first. */
export default async function WorldControlEvents() {
  const db = await getAppDb();
  const events = await db.select().from(gameEvents).orderBy(desc(gameEvents.sequence)).limit(200);

  return (
    <section className="flex flex-col gap-3">
      <Label>Game events ({events.length})</Label>

      <div className="overflow-x-auto rounded-md border border-line-subtle">
        <table className="w-full text-xs min-w-[760px]">
          <thead className="bg-surface-2 text-ink-subtle uppercase tracking-label">
            <tr>
              <th className="text-left font-medium px-3 py-2">#</th>
              <th className="text-left font-medium px-3 py-2">Event</th>
              <th className="text-left font-medium px-3 py-2">Career</th>
              <th className="text-left font-medium px-3 py-2">Visibility</th>
              <th className="text-left font-medium px-3 py-2">Occurred</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {events.map((event) => (
              <tr key={event.id} className="border-t border-line-subtle">
                <td className="px-3 py-2 text-ink-subtle">{event.sequence}</td>
                <td className="px-3 py-2 text-ink">
                  {gameEventLabels[event.eventType as keyof typeof gameEventLabels] ?? event.eventType}
                </td>
                <td className="px-3 py-2">
                  {event.careerId ? (
                    <Link href={`/world-control/careers/${event.careerId}`} className="text-ember">
                      {event.careerId}
                    </Link>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-muted">{event.visibility}</td>
                <td className="px-3 py-2 text-ink-subtle">
                  {new Date(event.occurredAt).toISOString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
