import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findWorldsForSlug } from "@music-rpg/domain";
import { EmptyState, Label } from "@music-rpg/ui";
import { getAppDb } from "@/lib/db";

export const metadata = { title: "Group" };

/** Legacy world-less group link. Resolves world-aware; never guesses. */
export default async function LegacyGroupRedirectPage({ params }: { params: { slug: string } }) {
  const db = await getAppDb();
  const matches = await findWorldsForSlug(db, "GROUP", params.slug);

  if (matches.length === 0) notFound();
  if (matches.length === 1) {
    redirect(`/world/${matches[0]!.worldSlug}/group/${params.slug}`);
  }

  return (
    <main id="main" className="mx-auto w-full max-w-[720px] px-gutter py-16 flex flex-col gap-6">
      <EmptyState
        eyebrow="Which world?"
        title={`More than one group goes by "${params.slug}".`}
        description="Names are unique inside a world, not across all of them. Pick the world you meant."
      />

      <section className="flex flex-col gap-2">
        <Label>Worlds</Label>
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.worldSlug}>
              <Link
                href={`/world/${match.worldSlug}/group/${params.slug}`}
                className="block rounded-md border border-line-subtle bg-surface-2 px-4 py-3 text-ink hover:border-line-strong"
              >
                {match.worldName}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
