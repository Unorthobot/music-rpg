import { describePersonality } from "@music-rpg/simulation";
import { Button, EmptyState, Label, RelationshipState, Surface, Tag } from "@music-rpg/ui";
import {
  getCrew,
  getCrewEligibility,
  getOpenMoments,
  getPeople,
  roleLabel,
  syncCareerRelationships,
} from "@music-rpg/domain";
import { CREW_ARRANGEMENT_LABELS } from "@music-rpg/shared";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { createCommandContext } from "@/lib/command-context";
import { ACT_LABELS, requireCareer } from "@/lib/career";
import { inviteToCrewAction, respondToMomentAction } from "./actions";

export const metadata = { title: "Crew" };

/**
 * The people around you.
 *
 * Three different things, kept visibly apart because they are not the same
 * fact:
 *
 * - **Moments** — something needs an answer. Raised above everything else,
 *   because it is the only thing here that is waiting on the player.
 * - **Collaborators** — you have history with them. That is all.
 * - **Crew** — they committed. The arrangement is shown next to them, and
 *   separately from how they feel, because what somebody agreed to and what
 *   they think of you are independent.
 *
 * Nothing on this screen is a number. Tension in particular is shown as plain
 * state rather than a warning: "some tension" sits perfectly well beside good
 * respect and strong chemistry, and colouring it red would tell the player to
 * go and fix something that is not broken.
 */
export default async function CrewPage({
  searchParams,
}: {
  searchParams: { error?: string; said?: string };
}) {
  const { user, view } = await requireCareer();
  const entity = view.entity;
  const isGroup = entity?.type === "GROUP";

  const db = await getAppDb();
  const ctx = await createCommandContext();

  /*
   * Bring relationships up to date with history already recorded.
   *
   * Safe on a read, and deliberately different from surfacing a moment.
   * Deriving is a fold over things that have already happened: it is
   * idempotent, it decides nothing, and it produces the same answer whenever it
   * runs — the watermark means a page load with nothing new costs one indexed
   * query. Surfacing a moment *is* the world deciding something, so it stays on
   * the day advance where time can be responsible for it.
   */
  await syncCareerRelationships(ctx, { careerId: view.career.id, userId: user.id });

  const [people, crew, moments] = await Promise.all([
    getPeople(db, view.career.id),
    getCrew(ctx, view.career.id),
    // Read-only. Moments surface when a day passes, never when a screen loads.
    getOpenMoments(ctx, view.career.id),
  ]);

  const crewIds = new Set(crew.map((member) => member.member.subjectId));
  const collaborators = people.filter((person) => !crewIds.has(person.subjectId));

  const eligibility = await Promise.all(
    collaborators.map(async (person) => ({
      subjectId: person.subjectId,
      ...(await getCrewEligibility(ctx, {
        careerId: view.career.id,
        subjectId: person.subjectId,
      })),
    })),
  );

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Crew"
      title="Crew"
    >
      {searchParams.error ? (
        <p role="alert" className="text-sm text-danger">
          {searchParams.error}
        </p>
      ) : null}

      {searchParams.said ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-1">
          <Label>They said</Label>
          <p className="text-base text-ink">{searchParams.said}</p>
        </Surface>
      ) : null}

      {/* Waiting on you. Above everything, because nothing else is. */}
      {moments.map((moment) => (
        <Surface
          key={moment.id}
          level={2}
          padded="lg"
          className="flex flex-col gap-3 border-ember-line bg-ember-soft"
        >
          <Label>Waiting on you</Label>
          <p className="text-xl font-semibold tracking-display text-balance">{moment.title}</p>
          <p className="text-sm text-ink-muted max-w-[60ch]">{moment.detail}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            {moment.options.map((option, index) => (
              <form key={option.response} action={respondToMomentAction}>
                <input type="hidden" name="momentId" value={moment.id} />
                <input type="hidden" name="response" value={option.response} />
                <Button type="submit" variant={index === 0 ? "primary" : "secondary"}>
                  {option.label}
                </Button>
              </form>
            ))}
          </div>
        </Surface>
      ))}

      {/* Committed. The arrangement sits apart from how they feel. */}
      <section className="flex flex-col gap-3">
        <Label>Crew</Label>
        {crew.length === 0 ? (
          <p className="text-sm text-ink-subtle">
            Nobody has committed to this yet. Working with somebody isn&apos;t the same as having
            them with you.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {crew.map(({ member, character }) => {
              const person = people.find((entry) => entry.subjectId === member.subjectId);
              return (
                <li key={member.id}>
                  <Surface level={1} padded="lg" className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="text-lg font-semibold tracking-display">
                        {character?.name ?? "Someone"}
                      </span>
                      <Tag tone="ember">Crew</Tag>
                      <span className="text-xs text-ink-subtle">
                        {character ? roleLabel(character.role) : ""}
                      </span>
                    </div>
                    {/* What was agreed — not how they feel. */}
                    <span className="text-sm text-ink-muted">
                      {CREW_ARRANGEMENT_LABELS[member.terms.arrangement] ?? "Terms agreed"}
                      {member.terms.note ? ` — “${member.terms.note}”` : ""}
                    </span>
                    {person ? <span className="text-sm text-ink">{person.line}</span> : null}
                  </Surface>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* History, and nothing more than history. */}
      <section className="flex flex-col gap-3">
        <Label>Collaborators</Label>
        {collaborators.length === 0 ? (
          <p className="text-sm text-ink-subtle">
            You haven&apos;t made anything with anybody yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {collaborators.map((person) => {
              const canAsk = eligibility.find((entry) => entry.subjectId === person.subjectId);
              return (
                <li key={person.subjectId}>
                  <Surface level={1} padded="lg" className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="text-lg font-semibold tracking-display">{person.name}</span>
                      <span className="text-xs text-ink-subtle">
                        {person.kindLabel} · {person.role}
                      </span>
                    </div>
                    <span className="text-sm text-ink">{person.line}</span>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {canAsk?.eligible ? (
                        <form action={inviteToCrewAction}>
                          <input type="hidden" name="subjectId" value={person.subjectId} />
                          <input type="hidden" name="arrangement" value="REVENUE_SHARE" />
                          <Button type="submit" variant="secondary">
                            Invite to crew
                          </Button>
                        </form>
                      ) : (
                        <span className="text-xs text-ink-subtle">{canAsk?.reason}</span>
                      )}
                    </div>
                  </Surface>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isGroup ? (
        <section className="flex flex-col gap-3">
          <Label>The group — {entity.group.name}</Label>
          <p className="text-sm text-ink-muted">
            These are members of your group, not crew. They make the music with you; crew is
            everyone else who ends up around it.
          </p>
          <ul className="flex flex-col gap-2">
            {entity.members.map((member) => {
              const isYou = member.artist.id === view.career.playerArtistId;
              return (
                <li key={member.artist.id}>
                  <RelationshipState
                    name={isYou ? `${member.artist.stageName} (you)` : member.artist.stageName}
                    role={`${roleLabel(member.membership.role)}${
                      member.membership.isFounder ? " · founding member" : ""
                    }${member.artist.authoredByCareerId && !isYou ? " · written by you" : ""}`}
                    standing={
                      isYou
                        ? "You"
                        : member.membership.satisfaction >= 65
                          ? "Committed"
                          : "Settling in"
                    }
                    tone={isYou || member.membership.satisfaction >= 65 ? "positive" : "neutral"}
                    note={
                      isYou
                        ? "Your own artist. Individually persistent — if this group ends, you don't."
                        : member.psychology
                          ? describePersonality(member.psychology)
                          : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/*
        Nobody at all yet. A group career still gets told this, because its
        members are the group rather than the wider crew — the two are
        different things and the screen keeps saying so.
      */}
      {people.length === 0 ? (
        <EmptyState
          eyebrow="Wider crew"
          title={
            isGroup
              ? "Beyond the group, you're on your own."
              : "No crew yet. Just you and the work."
          }
          description="Managers, engineers, promoters and the people who quietly decide whether a career happens. Work with somebody first — the rest follows from what passes between you."
        />
      ) : null}
    </AppShell>
  );
}
