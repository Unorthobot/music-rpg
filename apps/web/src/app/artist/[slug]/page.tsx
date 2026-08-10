import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicArtistProfile } from "@music-rpg/domain";
import { soundAdjectives } from "@music-rpg/simulation";
import { brand } from "@music-rpg/shared";
import { EmptyState, Label, Surface, Tag } from "@music-rpg/ui";
import { getAppDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * Public artist identity.
 *
 * The route exists from M1 so slugs are stable and shareable, but access is
 * controlled: a profile is visible to the world only when the artist is public,
 * and to its owner as a preview before then. Nothing here exposes the account
 * behind the artist, and no hidden simulation value is rendered.
 */
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const db = await getAppDb();
  const profile = await getPublicArtistProfile(db, params.slug, null);

  if (!profile || profile.access !== "PUBLIC") {
    return { title: `Artist · ${brand.shortName}` };
  }

  return {
    title: profile.stageName,
    description: profile.soundSummary ?? undefined,
  };
}

export default async function ArtistProfilePage({ params }: { params: { slug: string } }) {
  const db = await getAppDb();
  const user = await getCurrentUser();
  const profile = await getPublicArtistProfile(db, params.slug, user?.id ?? null);

  if (!profile) notFound();

  if (profile.access === "HIDDEN") {
    return (
      <main id="main" className="mx-auto w-full max-w-[720px] px-gutter py-16">
        <EmptyState
          eyebrow="Private"
          title="This artist isn't public yet."
          description="Careers stay unlisted until their artist opens the door. If this is yours, sign in to see the preview."
          action={
            <Link href="/login" className="text-sm text-ember underline underline-offset-4">
              Sign in
            </Link>
          }
        />
      </main>
    );
  }

  const adjectives = profile.sound ? soundAdjectives(profile.sound) : [];

  return (
    <main id="main" className="mx-auto w-full max-w-[720px] px-gutter py-12 flex flex-col gap-8">
      {profile.access === "OWNER_PREVIEW" ? (
        <p className="rounded-md border border-line bg-surface-2 px-4 py-3 text-sm text-ink-muted">
          Only you can see this. It goes public when your career does.
        </p>
      ) : null}

      <header className="flex flex-col gap-3">
        <Label>{profile.worldName}</Label>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-display break-words">
          {profile.stageName}
        </h1>
        {profile.archetype ? (
          <p className="text-base text-ember uppercase tracking-label">{profile.archetype.name}</p>
        ) : null}
        {profile.origin ? <p className="text-sm text-ink-subtle">{profile.origin}</p> : null}
        {profile.soundSummary ? (
          <p className="text-lg text-ink-muted max-w-[46ch] text-balance">{profile.soundSummary}</p>
        ) : null}
      </header>

      {adjectives.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {adjectives.map((adjective) => (
            <Tag key={adjective} tone="ember">
              {adjective}
            </Tag>
          ))}
        </div>
      ) : null}

      {profile.biography ? (
        <Surface level={1} padded="lg">
          <p className="text-sm text-ink-muted">{profile.biography}</p>
        </Surface>
      ) : null}

      {profile.creativePhilosophy ? (
        <p className="text-base text-ink border-l-2 border-ember-line pl-4">
          When people hear me, I want them to {profile.creativePhilosophy}
        </p>
      ) : null}

      {profile.traits.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Label>Traits</Label>
          <ul className="flex flex-col gap-2">
            {profile.traits.map((trait) => (
              <li key={trait.key} className="rounded-md border border-line-subtle bg-surface-2 px-4 py-3">
                <span className="text-sm font-medium text-ink">{trait.name}</span>
                <p className="text-xs text-ink-muted mt-1">{trait.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <Label>Catalogue</Label>
        <p className="text-sm text-ink-subtle">No releases yet.</p>
      </section>
    </main>
  );
}
