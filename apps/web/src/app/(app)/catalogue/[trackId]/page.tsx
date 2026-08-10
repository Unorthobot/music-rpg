import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, releases, trackVersions, tracks } from "@music-rpg/database";
import { getCatalogue } from "@music-rpg/domain";
import { RELEASE_STRATEGY_PROFILES, RELEASE_STRATEGIES } from "@music-rpg/shared";
import { Button, Label, Surface, Tag } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { PlayButton } from "@/components/player/play-button";
import { getAppDb } from "@/lib/db";
import { ACT_LABELS, requireCareer } from "@/lib/career";
import {
  cancelReleaseAction,
  keepPrivateAction,
  planReleaseAction,
  publishReleaseAction,
  scheduleReleaseAction,
  setFormatAction,
  setStrategyAction,
} from "../actions";

/**
 * One piece of work, and the decision about it.
 *
 * Two doors from unreleased: keep it private, or plan a release. Planning is a
 * sequence of real choices — shape, approach, date — each of which the domain
 * can refuse with a reason. None of it touches the work itself.
 */
export default async function TrackPage({
  params,
  searchParams,
}: {
  params: { trackId: string };
  searchParams: { error?: string };
}) {
  const { view } = await requireCareer();
  const db = await getAppDb();

  const [trackRow] = await db.select().from(tracks).where(eq(tracks.id, params.trackId));
  if (!trackRow || trackRow.careerId !== view.career.id) notFound();

  const [versions, releaseRows, catalogue] = await Promise.all([
    db.select().from(trackVersions).where(eq(trackVersions.trackId, trackRow.id)),
    db.select().from(releases).where(eq(releases.trackId, trackRow.id)),
    getCatalogue(db, view.career),
  ]);

  const master = versions.find((version) => version.id === trackRow.currentMasterVersionId);
  const release = releaseRows.find((row) => row.status !== "CANCELLED") ?? null;
  const isOut = trackRow.status === "RELEASED";

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Catalogue"
      title={trackRow.title ?? "Untitled"}
    >
      {searchParams.error ? (
        <p role="alert" className="text-sm text-danger">
          {searchParams.error}
        </p>
      ) : null}

      <Surface level={1} padded="lg" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tag tone={isOut ? "ember" : "neutral"}>
            {isOut ? "Out now" : trackRow.status.toLowerCase()}
          </Tag>
          {trackRow.keptPrivateAt && !release ? <Tag>Kept private</Tag> : null}
        </div>

        {master ? (
          <>
            <p className="text-base text-ink-muted">{master.content.description}</p>
            <div className="flex flex-wrap items-center gap-3">
              <PlayButton
                track={{
                  id: trackRow.id,
                  title: trackRow.title ?? "Untitled",
                  artistName: view.displayName,
                  audioUrl: null,
                  developmentPreview: true,
                }}
                variant="secondary"
              />
              <span className="text-xs text-ink-subtle">
                Development preview — structured work, not audio
              </span>
            </div>
          </>
        ) : null}

        <p className="text-xs text-ink-subtle">
          {versions.length} {versions.length === 1 ? "version" : "versions"}, all kept.
        </p>
      </Surface>

      {isOut ? (
        <Surface level={2} padded="lg" className="flex flex-col gap-2 border-ember-line">
          <Label>Out in the world</Label>
          <p className="text-base text-ink">
            It exists publicly now. Nobody has reacted yet — that comes later.
          </p>
          <Link
            href={`/world/${view.world.slug}/track/${trackRow.id}`}
            className="text-sm text-ember underline underline-offset-4 min-h-[44px] inline-flex items-center"
          >
            See its public page
          </Link>
        </Surface>
      ) : !release ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Surface level={1} padded="lg" className="flex flex-col gap-3">
            <Label>Keep private</Label>
            <p className="text-sm text-ink-muted">
              Hold it back. It stays yours, finished, and unheard.
            </p>
            <form action={keepPrivateAction}>
              <input type="hidden" name="trackId" value={trackRow.id} />
              <Button type="submit" variant="secondary">
                Keep it private
              </Button>
            </form>
          </Surface>

          <Surface level={2} padded="lg" className="flex flex-col gap-3 border-ember-line">
            <Label>Plan release</Label>
            <p className="text-sm text-ink-muted">
              Decide how it goes out, and when. You can still pull it.
            </p>
            <form action={planReleaseAction}>
              <input type="hidden" name="trackId" value={trackRow.id} />
              <input type="hidden" name="format" value="SINGLE" />
              <Button type="submit">Plan a release</Button>
            </form>
          </Surface>
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <Label>How are you releasing it?</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {catalogue.formats.map((format) => (
                <form key={format.format} action={setFormatAction}>
                  <input type="hidden" name="trackId" value={trackRow.id} />
                  <input type="hidden" name="releaseId" value={release.id} />
                  <input type="hidden" name="format" value={format.format} />
                  <button
                    type="submit"
                    disabled={!format.available || release.status !== "PLANNED"}
                    className={`w-full text-left rounded-md border px-4 py-3 min-h-[44px] transition-colors duration-fast disabled:opacity-50 ${
                      release.format === format.format
                        ? "border-ember bg-ember-soft"
                        : "border-line-subtle bg-surface-2 hover:bg-surface-3"
                    }`}
                  >
                    <span className="block text-sm text-ink">{format.label}</span>
                    <span className="block text-xs text-ink-subtle">
                      {format.available ? format.detail : format.lockedReason}
                    </span>
                  </button>
                </form>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <Label>How do you want to put it out?</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {RELEASE_STRATEGIES.map((strategy) => {
                const profile = RELEASE_STRATEGY_PROFILES[strategy];
                return (
                  <form key={strategy} action={setStrategyAction}>
                    <input type="hidden" name="trackId" value={trackRow.id} />
                    <input type="hidden" name="releaseId" value={release.id} />
                    <input type="hidden" name="strategy" value={strategy} />
                    <button
                      type="submit"
                      disabled={release.status !== "PLANNED"}
                      className={`w-full text-left rounded-md border px-4 py-3 min-h-[44px] transition-colors duration-fast disabled:opacity-50 ${
                        release.strategy === strategy
                          ? "border-ember bg-ember-soft"
                          : "border-line-subtle bg-surface-2 hover:bg-surface-3"
                      }`}
                    >
                      <span className="block text-sm text-ink">{profile.label}</span>
                      <span className="block text-xs text-ink-subtle">{profile.detail}</span>
                      <span className="block text-xs text-ink-subtle mt-1">
                        {profile.leadDays === 0
                          ? "No wait"
                          : `${profile.leadDays} days before release`}
                        {profile.requires.length ? ` · needs ${profile.requires.join(", ").toLowerCase()}` : ""}
                      </span>
                    </button>
                  </form>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <Label>When?</Label>
            {release.status === "SCHEDULED" ? (
              <Surface level={2} padded="lg" className="flex flex-col gap-3 border-ember-line">
                <p className="text-base text-ink">
                  Scheduled for{" "}
                  {new Date(release.scheduledGameTime!).toLocaleDateString("en-ZA", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                  .
                </p>
                <div className="flex flex-wrap gap-3">
                  <form action={publishReleaseAction}>
                    <input type="hidden" name="trackId" value={trackRow.id} />
                    <input type="hidden" name="releaseId" value={release.id} />
                    <Button type="submit">Put it out</Button>
                  </form>
                  <form action={cancelReleaseAction}>
                    <input type="hidden" name="trackId" value={trackRow.id} />
                    <input type="hidden" name="releaseId" value={release.id} />
                    <Button type="submit" variant="ghost">
                      Pull it
                    </Button>
                  </form>
                </div>
              </Surface>
            ) : (
              <div className="flex flex-wrap gap-3">
                {[
                  { when: "earliest", label: "As soon as possible" },
                  { when: "tomorrow", label: "Tomorrow" },
                ].map((option) => (
                  <form key={option.when} action={scheduleReleaseAction}>
                    <input type="hidden" name="trackId" value={trackRow.id} />
                    <input type="hidden" name="releaseId" value={release.id} />
                    <input type="hidden" name="when" value={option.when} />
                    <Button type="submit" variant="secondary">
                      {option.label}
                    </Button>
                  </form>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
