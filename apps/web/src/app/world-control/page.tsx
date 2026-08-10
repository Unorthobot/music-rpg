import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import {
  artists,
  careers,
  gameEvents,
  groups,
  users,
  worlds,
} from "@music-rpg/database";
import { Label, Surface } from "@music-rpg/ui";
import { getAppDb } from "@/lib/db";

/** Counts and the current world list. Read-only. */
export default async function WorldControlOverview() {
  const db = await getAppDb();

  const [worldRows, counts, recentCareers] = await Promise.all([
    db.select().from(worlds).orderBy(worlds.createdAt),
    Promise.all([
      db.select({ value: sql<number>`count(*)::int` }).from(users),
      db.select({ value: sql<number>`count(*)::int` }).from(careers),
      db.select({ value: sql<number>`count(*)::int` }).from(artists),
      db.select({ value: sql<number>`count(*)::int` }).from(groups),
      db.select({ value: sql<number>`count(*)::int` }).from(gameEvents),
    ]),
    db.select().from(careers).orderBy(desc(careers.lastActiveAt)).limit(10),
  ]);

  const [userCount, careerCount, artistCount, groupCount, eventCount] = counts.map(
    (rows) => rows[0]?.value ?? 0,
  );

  const tiles = [
    { label: "Users", value: userCount },
    { label: "Careers", value: careerCount },
    { label: "Artists", value: artistCount },
    { label: "Groups", value: groupCount },
    { label: "Game events", value: eventCount },
  ];

  return (
    <>
      <section className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {tiles.map((tile) => (
          <Surface key={tile.label} level={1} padded="sm" className="flex flex-col gap-1">
            <Label>{tile.label}</Label>
            <span className="text-2xl font-semibold tabular-nums">{tile.value}</span>
          </Surface>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <Label>Worlds</Label>
        <ul className="flex flex-col gap-2">
          {worldRows.map((world) => (
            <li
              key={world.id}
              className="rounded-md border border-line-subtle bg-surface-2 px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-sm"
            >
              <span className="text-ink font-medium">{world.name}</span>
              <span className="text-ink-subtle font-mono text-xs">{world.id}</span>
              <span className="text-ink-muted">{world.status}</span>
              <span className="text-ink-muted">
                game time {new Date(world.currentGameTime).toISOString().slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <Label>Recent careers</Label>
        <ul className="flex flex-col gap-2">
          {recentCareers.map((career) => (
            <li key={career.id}>
              <Link
                href={`/world-control/careers/${career.id}`}
                className="block rounded-md border border-line-subtle bg-surface-2 px-4 py-3 hover:border-line-strong"
              >
                <span className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span className="text-ink font-medium">{career.name}</span>
                  <span className="text-ink-muted">{career.careerType ?? "—"}</span>
                  <span className="text-ink-muted">{career.status}</span>
                  <span className="text-ink-muted">{career.careerAct}</span>
                  <span className="text-ink-subtle">{career.onboardingState}</span>
                  <span className="text-ink-subtle font-mono text-xs">{career.id}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
