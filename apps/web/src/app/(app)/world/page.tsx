import { and, desc, eq, isNotNull } from "drizzle-orm";
import { scenes, tracks } from "@music-rpg/database";
import { gameEventLabels, listCareerEvents } from "@music-rpg/events";
import Link from "next/link";
import { EmptyState, Label, Surface, Tag, WorldEventCard } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { ACT_LABELS, requireCareer } from "@/lib/career";

export const metadata = { title: "World" };

/**
 * World.
 *
 * The world exists and is persistent, but world simulation starts in a later
 * milestone. What is shown here is real: the scenes of Johannesburg, and the
 * events this career has actually generated in it.
 */
export default async function WorldPage() {
  const { view } = await requireCareer();
  const db = await getAppDb();

  const worldScenes = await db.select().from(scenes).where(eq(scenes.worldId, view.world.id));

  /*
   * What the world can actually discover. A release that nobody can find is
   * only half-published, so released work from this world is listed here —
   * including other careers', once there are any.
   */
  const released = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.worldId, view.world.id), isNotNull(tracks.releasedAt)))
    .orderBy(desc(tracks.releasedAt))
    .limit(20);
  const events = await listCareerEvents(db, view.career.id, 20);
  const publicEvents = events
    .filter((event) => event.visibility === "LOCAL_PUBLIC" || event.visibility === "GLOBAL_PUBLIC")
    .reverse();

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow={view.world.name}
      title="World"
      context={
        <Surface level={1} padded="lg" className="flex flex-col gap-2">
          <Label>In-world date</Label>
          <p className="text-base text-ink">
            {new Date(view.career.currentGameDate).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <p className="text-sm text-ink-muted">
            Time moves when your career does. Nothing has moved it yet.
          </p>
        </Surface>
      }
      contextLabel="World context"
    >
      {released.length === 0 ? (
        <EmptyState
          eyebrow={view.world.name}
          title="The scene is quiet for now."
          description="Nothing has been released here yet. Shows, rivals and scene politics start moving in a later milestone."
          comingNext
        />
      ) : (
        <section className="flex flex-col gap-3">
          <Label>Out in {view.world.name}</Label>
          <ul className="flex flex-col gap-2">
            {released.map((trackRow) => (
              <li key={trackRow.id}>
                <Link href={`/world/${view.world.slug}/track/${trackRow.id}`} className="block">
                  <Surface
                    level={1}
                    padded="sm"
                    className="flex items-center justify-between gap-4 hover:border-line-strong transition-colors duration-fast"
                  >
                    <span className="flex flex-col gap-1 min-w-0">
                      <span className="text-base text-ink truncate">
                        {trackRow.title ?? "Untitled"}
                      </span>
                      <span className="text-xs text-ink-subtle">
                        {trackRow.ownerType === "GROUP" ? "Group release" : "Solo release"}
                      </span>
                    </span>
                    <Tag tone="ember">Out now</Tag>
                  </Surface>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-muted">
            How any of it is received is a later milestone. Right now it simply exists.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <Label>Scenes</Label>
        <ul className="grid gap-3 md:grid-cols-2">
          {worldScenes.map((scene) => (
            <li
              key={scene.id}
              className="rounded-lg border border-line-subtle bg-surface-2 p-4 flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-medium text-ink">{scene.name}</span>
                {scene.id === view.career.primarySceneId ? (
                  <span className="text-2xs uppercase tracking-label text-ember">Home scene</span>
                ) : null}
              </div>
              <p className="text-sm text-ink-muted">{scene.description}</p>
            </li>
          ))}
        </ul>
      </section>

      {publicEvents.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Label>What the scene has seen</Label>
          <ul className="flex flex-col gap-2">
            {publicEvents.map((event) => (
              <li key={event.id}>
                <WorldEventCard
                  label={
                    gameEventLabels[event.eventType as keyof typeof gameEventLabels] ?? event.eventType
                  }
                  description={`${view.displayName} · ${view.world.name}`}
                  timestamp={new Date(event.occurredAt).toLocaleDateString("en-ZA", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  importance={event.importance}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
