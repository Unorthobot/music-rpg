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

  /*
   * Partitioned by whether the career can actually release the format, which is
   * the question the two headings ask.
   *
   * It used to split on `minimumTracks === 1`, and that was indistinguishable
   * from this while no career could leave The Underground: every multi-track
   * format was act-locked for everybody, so "Not yet" was true by accident. The
   * first career to come up with four tracks would have found its EP listed
   * under **Not yet** with a tag reading **Open** — the heading contradicting
   * the tag beside it, on the one screen whose whole job is an honest account of
   * what is and is not open.
   */
  const open = catalogue.formats.filter((format) => format.available);
  const locked = catalogue.formats.filter((format) => !format.available);

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

      {/*
        Both sections are conditional, because either can legitimately be empty:
        a career with no finished tracks can release nothing, and a career deep
        enough into its catalogue can release everything. A heading over an empty
        list would announce a category the player has failed to fill.
      */}
      {open.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Label>Available now</Label>
          <ul className="flex flex-col gap-2">
            {open.map((format) => (
              <li key={format.format}>
                <Surface level={1} padded="sm" className="flex items-start justify-between gap-4">
                  <span className="flex flex-col gap-1">
                    <span className="text-base text-ink">{format.label}</span>
                    <span className="text-sm text-ink-muted">{format.detail}</span>
                  </span>
                  <Tag tone="ember">Open</Tag>
                </Surface>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {locked.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Label>Not yet</Label>
          <ul className="flex flex-col gap-2">
            {locked.map((format) => (
              <li key={format.format}>
                <Surface
                  level={1}
                  padded="sm"
                  className="flex items-start justify-between gap-4 opacity-80"
                  aria-disabled
                >
                  <span className="flex flex-col gap-1">
                    <span className="text-base text-ink">{format.label}</span>
                    <span className="text-sm text-ink-muted">{format.detail}</span>
                    {/*
                      The reason, from the rules that produced it. Never a
                      requirement this screen restated for itself — an unavailable
                      format always carries one, and inventing a second phrasing
                      here is how the tracks a player is told they need stops
                      matching the number the command enforces.
                    */}
                    <span className="text-xs text-ink-subtle">{format.lockedReason}</span>
                  </span>
                  <Tag>Locked</Tag>
                </Surface>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
