import Link from "next/link";
import { getCatalogue } from "@music-rpg/domain";
import { EmptyState, Label, Surface, Tag } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { createCommandContext } from "@/lib/command-context";
import { getAppDb } from "@/lib/db";
import { ACT_LABELS, requireCareer } from "@/lib/career";

export const metadata = { title: "Catalogue" };

const STATUS_TONE: Record<string, "ember" | "neutral"> = {
  RELEASED: "ember",
  SCHEDULED: "ember",
};

/**
 * Everything this career has made, and what has been decided about it.
 *
 * The catalogue is where creation and publication meet without merging: work
 * arrives here from the Studio, and leaves for the world through a release.
 */
export default async function CataloguePage() {
  const { user, view } = await requireCareer();
  const ctx = await createCommandContext();
  const catalogue = await getCatalogue(await getAppDb(), view.career);

  await ctx.analytics.track({
    name: "catalogue_viewed",
    userId: user.id,
    careerId: view.career.id,
    properties: { tracks: catalogue.tracks.length, released: catalogue.releasedCount },
  });

  const locked = catalogue.formats.filter((format) => !format.available);

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Catalogue"
      title="Catalogue"
      context={
        <Surface level={1} padded="lg" className="flex flex-col gap-3">
          <Label>Bodies of work</Label>
          <p className="text-sm text-ink-muted">
            Projects open when you have the music for them.
          </p>
          <ul className="flex flex-col gap-2">
            {locked.map((format) => (
              <li key={format.format} className="flex flex-col">
                <span className="text-sm text-ink-subtle">{format.label}</span>
                <span className="text-xs text-ink-subtle">{format.lockedReason}</span>
              </li>
            ))}
          </ul>
        </Surface>
      }
      contextLabel="Projects"
    >
      {catalogue.tracks.length === 0 ? (
        <EmptyState
          eyebrow="Catalogue"
          title="Nothing made yet."
          description="Tracks arrive here from the Studio. Nothing can be released until something exists."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {catalogue.tracks.map(({ track, release }) => (
            <li key={track.id}>
              <Link href={`/catalogue/${track.id}`} className="block">
                <Surface
                  level={1}
                  padded="sm"
                  className="flex items-center justify-between gap-4 hover:border-line-strong transition-colors duration-fast"
                >
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="text-base text-ink truncate">
                      {track.title ?? "Untitled"}
                    </span>
                    <span className="text-xs text-ink-subtle">
                      {track.keptPrivateAt && !release ? "Kept private" : null}
                      {release?.status === "SCHEDULED" ? "Release scheduled" : null}
                      {track.releasedAt
                        ? `Out since ${new Date(track.releasedAt).toLocaleDateString("en-ZA", {
                            day: "numeric",
                            month: "short",
                          })}`
                        : null}
                    </span>
                  </span>
                  <Tag tone={STATUS_TONE[track.status] ?? "neutral"}>
                    {track.status === "RELEASED" ? "Out now" : track.status.toLowerCase()}
                  </Tag>
                </Surface>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
