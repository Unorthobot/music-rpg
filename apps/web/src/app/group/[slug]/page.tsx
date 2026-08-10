import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicGroupProfile, roleLabel } from "@music-rpg/domain";
import { soundAdjectives } from "@music-rpg/simulation";
import { brand } from "@music-rpg/shared";
import { EmptyState, Label, Surface, Tag } from "@music-rpg/ui";
import { getAppDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/** Public group identity. Same access rules as an artist profile. */
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const db = await getAppDb();
  const profile = await getPublicGroupProfile(db, params.slug, null);

  if (!profile || profile.access !== "PUBLIC") {
    return { title: `Group · ${brand.shortName}` };
  }

  return { title: profile.name, description: profile.soundSummary ?? undefined };
}

export default async function GroupProfilePage({ params }: { params: { slug: string } }) {
  const db = await getAppDb();
  const user = await getCurrentUser();
  const profile = await getPublicGroupProfile(db, params.slug, user?.id ?? null);

  if (!profile) notFound();

  if (profile.access === "HIDDEN") {
    return (
      <main id="main" className="mx-auto w-full max-w-[720px] px-gutter py-16">
        <EmptyState
          eyebrow="Private"
          title="This group isn't public yet."
          description="Groups stay unlisted until they open the door. If this is yours, sign in to see the preview."
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
          {profile.name}
        </h1>
        {profile.archetype ? (
          <p className="text-base text-ember uppercase tracking-label">{profile.archetype.name}</p>
        ) : null}
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
          When people hear us, I want them to {profile.creativePhilosophy}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <Label>Members</Label>
        <ul className="flex flex-col gap-2">
          {profile.members.map((member) => (
            <li
              key={member.slug}
              className="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-surface-2 px-4 py-3"
            >
              <Link href={`/artist/${member.slug}`} className="text-base text-ink hover:text-ember">
                {member.stageName}
              </Link>
              <span className="text-xs text-ink-subtle uppercase tracking-label">
                {roleLabel(member.role)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
