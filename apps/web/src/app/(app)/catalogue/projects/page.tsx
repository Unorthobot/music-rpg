import { getCatalogue } from "@music-rpg/domain";
import { Label, Surface, Tag } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { ACT_LABELS, requireCareer } from "@/lib/career";

export const metadata = { title: "Projects" };

/**
 * Bodies of work, mostly locked.
 *
 * Shown rather than hidden: the catalogue model the career is heading towards
 * should be visible from the start, with honest reasons for why each shape is
 * not available yet. A one-track career sees what an album would require, not
 * a button that does nothing.
 */
export default async function ProjectsPage() {
  const { view } = await requireCareer();
  const db = await getAppDb();
  const catalogue = await getCatalogue(db, view.career);

  const singles = catalogue.formats.filter((format) => format.minimumTracks === 1);
  const bodies = catalogue.formats.filter((format) => format.minimumTracks > 1);

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Catalogue"
      title="Projects"
    >
      <p className="text-base text-ink-muted max-w-[60ch]">
        You have {catalogue.tracks.length}{" "}
        {catalogue.tracks.length === 1 ? "track" : "tracks"}. Projects are how several become one
        thing — and the interface opens them when your catalogue and your career can carry them.
      </p>

      <section className="flex flex-col gap-3">
        <Label>Available now</Label>
        <ul className="flex flex-col gap-2">
          {singles.map((format) => (
            <li key={format.format}>
              <Surface level={1} padded="sm" className="flex items-start justify-between gap-4">
                <span className="flex flex-col gap-1">
                  <span className="text-base text-ink">{format.label}</span>
                  <span className="text-sm text-ink-muted">{format.detail}</span>
                </span>
                <Tag tone={format.available ? "ember" : "neutral"}>
                  {format.available ? "Open" : "Locked"}
                </Tag>
              </Surface>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <Label>Not yet</Label>
        <ul className="flex flex-col gap-2">
          {bodies.map((format) => (
            <li key={format.format}>
              <Surface
                level={1}
                padded="sm"
                className="flex items-start justify-between gap-4 opacity-80"
                aria-disabled={!format.available}
              >
                <span className="flex flex-col gap-1">
                  <span className="text-base text-ink">{format.label}</span>
                  <span className="text-sm text-ink-muted">{format.detail}</span>
                  <span className="text-xs text-ink-subtle">
                    {format.lockedReason ?? `Needs ${format.minimumTracks} tracks.`}
                  </span>
                </span>
                <Tag>{format.available ? "Open" : "Locked"}</Tag>
              </Surface>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
