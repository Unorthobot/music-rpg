import Link from "next/link";
import { notFound } from "next/navigation";
import {
  artists,
  eq,
  groups,
  trackVersions,
  tracks,
  worlds,
} from "@music-rpg/database";
import { brand } from "@music-rpg/shared";
import { Label, Surface, Tag } from "@music-rpg/ui";
import { getAppDb } from "@/lib/db";

/**
 * A released track, in public.
 *
 * Visible because it was released — not because it exists. Unreleased and
 * scheduled work is not reachable here at all, which is the difference between
 * making something and putting it out.
 *
 * There is nothing about audience on this page. The record is out; whether
 * anyone cared is a later system's answer, and inventing one here would be the
 * fake state we've refused everywhere else.
 */
export async function generateMetadata({ params }: { params: { trackId: string } }) {
  const db = await getAppDb();
  const [trackRow] = await db.select().from(tracks).where(eq(tracks.id, params.trackId));

  if (!trackRow || trackRow.status !== "RELEASED") return { title: `Track · ${brand.shortName}` };
  return { title: trackRow.title ?? "Untitled" };
}

export default async function PublicTrackPage({
  params,
}: {
  params: { worldSlug: string; trackId: string };
}) {
  const db = await getAppDb();

  const [world] = await db.select().from(worlds).where(eq(worlds.slug, params.worldSlug));
  if (!world) notFound();

  const [trackRow] = await db.select().from(tracks).where(eq(tracks.id, params.trackId));

  // Only released work is public. Everything else is simply not here.
  if (!trackRow || trackRow.worldId !== world.id || trackRow.status !== "RELEASED") notFound();

  const [versions, artistRows, groupRows] = await Promise.all([
    db.select().from(trackVersions).where(eq(trackVersions.trackId, trackRow.id)),
    trackRow.primaryArtistId
      ? db.select().from(artists).where(eq(artists.id, trackRow.primaryArtistId))
      : Promise.resolve([]),
    trackRow.ownerType === "GROUP"
      ? db.select().from(groups).where(eq(groups.id, trackRow.ownerId))
      : Promise.resolve([]),
  ]);

  const master = versions.find((version) => version.id === trackRow.currentMasterVersionId);
  const artist = artistRows[0];
  const group = groupRows[0];
  const billedAs = group?.name ?? artist?.stageName ?? "Unknown";

  return (
    <main id="main" className="mx-auto w-full max-w-[720px] px-gutter py-12 flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Label>{world.name}</Label>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-display break-words">
          {trackRow.title ?? "Untitled"}
        </h1>
        <p className="text-lg text-ink-muted">{billedAs}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="ember">Out now</Tag>
          <span className="text-xs text-ink-subtle">
            {trackRow.releasedAt
              ? new Date(trackRow.releasedAt).toLocaleDateString("en-ZA", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : null}
          </span>
        </div>
      </header>

      {master ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-4">
          <div
            aria-hidden
            className="flex h-16 items-end gap-[2px] rounded-md bg-surface-inset px-3 py-2"
          >
            {master.content.waveform.map((value, index) => (
              <span
                key={index}
                className="flex-1 rounded-sm bg-ember/70"
                style={{ height: `${Math.max(6, value)}%` }}
              />
            ))}
          </div>
          <p className="text-2xs uppercase tracking-label text-ink-subtle">
            Development preview — structured work, not audio
          </p>
          <p className="text-base text-ink-muted">{master.content.description}</p>
          <p className="text-sm text-ink-subtle">{master.content.structure.join(" · ")}</p>
        </Surface>
      ) : null}

      {/*
        * Credits, not decoration. A group is billed as the primary artist, and
        * the member who actually made it is still named — losing that the
        * moment work becomes public is exactly the solo assumption we refuse.
        */}
      <section className="flex flex-col gap-2">
        <Label>Credits</Label>
        <ul className="flex flex-col gap-1 text-sm">
          <li className="text-ink">
            <span className="text-ink-subtle">Primary artist · </span>
            {billedAs}
          </li>
          {artist ? (
            <li className="text-ink">
              <span className="text-ink-subtle">
                {group ? "Contributing artist · " : "Performed by · "}
              </span>
              <Link
                href={`/world/${world.slug}/artist/${artist.slug}`}
                className="text-ember underline underline-offset-4"
              >
                {artist.stageName}
              </Link>
            </li>
          ) : null}
        </ul>
      </section>

      {artist ? (
        <Link
          href={`/world/${world.slug}/artist/${artist.slug}`}
          className="text-sm text-ember underline underline-offset-4 min-h-[44px] inline-flex items-center"
        >
          More from {artist.stageName}
        </Link>
      ) : null}
    </main>
  );
}
