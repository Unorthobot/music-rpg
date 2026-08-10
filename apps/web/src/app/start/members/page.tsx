import { getCandidateViews } from "@music-rpg/domain";
import { computeChemistry } from "@music-rpg/simulation";
import { Button, Label, Surface, Tag } from "@music-rpg/ui";
import { getAppDb } from "@/lib/db";
import { requireOnboardingStep } from "../guard";
import { StepFrame } from "../step-frame";
import { addMemberAction, confirmLineupAction, removeMemberAction } from "../actions";

export const metadata = { title: "Choose your members" };

/**
 * Step 4 (group only) — the line-up.
 *
 * Candidates are real world NPCs. Everything shown about them is qualitative:
 * role, one standout strength, a personality read and a creative tendency.
 * Their actual skill and psychology values stay hidden, exactly as they will
 * when NPC simulation starts driving them.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { onboarding } = await requireOnboardingStep("MEMBERS");
  const { career, view } = onboarding;

  const group = view?.entity?.type === "GROUP" ? view.entity : null;
  const db = await getAppDb();
  const candidates = await getCandidateViews(db, career.worldId, group?.group.id ?? null);

  const chosen = group?.members ?? [];
  const chosenIds = new Set(chosen.map((member) => member.artist.id));

  const chemistry = computeChemistry(
    chosen
      .filter((member) => member.sound && member.psychology)
      .map((member) => ({ sound: member.sound!, psychology: member.psychology! })),
  );

  return (
    <StepFrame
      step={4}
      totalSteps={4}
      eyebrow="Founding line-up"
      title="WHO'S IN THIS WITH YOU?"
      intro="Pick between one and four. Talent is not the only thing that matters — how these people handle each other decides how long the group lasts."
      error={searchParams.error}
    >
      {chosen.length > 0 ? (
        <Surface level={2} padded="lg" className="flex flex-col gap-4">
          <Label>In the group — chemistry {chemistry.score}</Label>
          <p className="text-base text-ink">{chemistry.summary}</p>

          <ul className="flex flex-col gap-2">
            {chosen.map((member) => (
              <li
                key={member.artist.id}
                className="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-surface-1 px-4 py-3"
              >
                <span className="flex flex-col min-w-0">
                  <span className="text-base text-ink truncate">{member.artist.stageName}</span>
                  <span className="text-xs text-ink-subtle">
                    {member.membership.role.replace("_", " ").toLowerCase()}
                    {member.membership.isFounder ? " · founding member" : ""}
                  </span>
                </span>
                <form action={removeMemberAction}>
                  <input type="hidden" name="careerId" value={career.id} />
                  <input type="hidden" name="artistId" value={member.artist.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>

          {chemistry.strengths.length > 0 || chemistry.tensions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {chemistry.strengths.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <Label>What works</Label>
                  <ul className="flex flex-col gap-1">
                    {chemistry.strengths.map((line) => (
                      <li key={line} className="text-sm text-ink-muted">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {chemistry.tensions.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <Label>What won&apos;t</Label>
                  <ul className="flex flex-col gap-1">
                    {chemistry.tensions.map((line) => (
                      <li key={line} className="text-sm text-warning">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </Surface>
      ) : null}

      <div className="flex flex-col gap-3">
        <Label>Available in {view?.world.name ?? "the scene"}</Label>
        {candidates.map((candidate) => {
          const inGroup = chosenIds.has(candidate.artist.id);
          return (
            <Surface
              key={candidate.artist.id}
              level={1}
              padded="sm"
              className="flex flex-wrap items-start justify-between gap-4"
            >
              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-lg font-semibold tracking-display">
                    {candidate.artist.stageName}
                  </span>
                  <Tag>{candidate.role}</Tag>
                </div>
                <p className="text-sm text-ink-muted">{candidate.artist.biography}</p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
                  <li>{candidate.strength}</li>
                  <li>{candidate.personality}</li>
                  <li>{candidate.tendency}</li>
                </ul>
              </div>

              {inGroup ? (
                <span className="text-xs text-ember uppercase tracking-label self-center">
                  In the group
                </span>
              ) : (
                <form action={addMemberAction} className="self-center">
                  <input type="hidden" name="careerId" value={career.id} />
                  <input type="hidden" name="artistId" value={candidate.artist.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    Add
                  </Button>
                </form>
              )}
            </Surface>
          );
        })}
      </div>

      <form action={confirmLineupAction} className="pt-2">
        <input type="hidden" name="careerId" value={career.id} />
        <Button type="submit" size="lg" disabled={chosen.length === 0}>
          Lock the line-up
        </Button>
      </form>
    </StepFrame>
  );
}
