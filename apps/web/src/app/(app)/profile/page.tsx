import Link from "next/link";
import { Label, Surface, Tag } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { ACT_LABELS, requireCareer } from "@/lib/career";

export const metadata = { title: "Profile" };

/**
 * Profile.
 *
 * Shows the public identity route that already exists for this career, and is
 * explicit that it is closed. Account identity (email, username) is never shown
 * alongside artist identity — they are different things and stay that way.
 */
export default async function ProfilePage() {
  const { view } = await requireCareer();
  const entity = view.entity;

  // Public addresses are world-scoped, because a stage name is only unique
  // inside a world.
  const publicPath =
    entity?.type === "ARTIST"
      ? `/world/${view.world.slug}/artist/${entity.artist.slug}`
      : entity?.type === "GROUP"
        ? `/world/${view.world.slug}/group/${entity.group.slug}`
        : null;

  const playerArtistPath = view.playerArtist
    ? `/world/${view.world.slug}/artist/${view.playerArtist.artist.slug}`
    : null;

  const isPublic =
    entity?.type === "ARTIST" ? entity.artist.isPublic : (entity?.group.isPublic ?? false);

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Profile"
      title="Public identity"
    >
      <Surface level={1} padded="lg" className="flex flex-col gap-3">
        <Label>Your page</Label>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-lg font-semibold tracking-display">{view.displayName}</span>
          <Tag tone={isPublic ? "ember" : "neutral"}>{isPublic ? "Public" : "Not public yet"}</Tag>
        </div>

        {publicPath ? (
          <>
            <p className="text-sm text-ink-muted">
              This address is reserved for you and works already — right now only you can see what
              is behind it.
            </p>
            <Link
              href={publicPath}
              className="text-sm text-ember underline underline-offset-4 min-h-[44px] inline-flex items-center"
            >
              {publicPath}
            </Link>
          </>
        ) : null}
      </Surface>

      {playerArtistPath && playerArtistPath !== publicPath ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-3">
          <Label>You, individually</Label>
          <p className="text-sm text-ink-muted">
            Your career controls {view.displayName}, but you are also{" "}
            {view.playerArtist?.artist.stageName} — a musician in your own right, with your own page.
          </p>
          <Link
            href={playerArtistPath}
            className="text-sm text-ember underline underline-offset-4 min-h-[44px] inline-flex items-center"
          >
            {playerArtistPath}
          </Link>
        </Surface>
      ) : null}

      <Surface level={1} padded="lg" className="flex flex-col gap-2">
        <Label>Account</Label>
        <p className="text-sm text-ink-muted">
          Your account is separate from your artist. Nothing about the person behind {view.displayName}{" "}
          appears on a public page, now or later.
        </p>
      </Surface>
    </AppShell>
  );
}
