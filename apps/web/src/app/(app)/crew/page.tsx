import { describePersonality } from "@music-rpg/simulation";
import { EmptyState, Label, RelationshipState, Surface } from "@music-rpg/ui";
import { roleLabel } from "@music-rpg/domain";
import { AppShell } from "@/components/shell/app-shell";
import { ACT_LABELS, requireCareer } from "@/lib/career";

export const metadata = { title: "Crew" };

/**
 * Crew.
 *
 * Group membership and crew are different things and this screen keeps them
 * apart: a group is the creative unit that makes the music, crew is the wider
 * career network (management, engineers, allies) that arrives later. A group
 * career sees its members here; a solo career sees an honest empty state.
 */
export default async function CrewPage() {
  const { view } = await requireCareer();
  const entity = view.entity;
  const isGroup = entity?.type === "GROUP";

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Crew"
      title="Crew"
    >
      {isGroup ? (
        <section className="flex flex-col gap-3">
          <Label>The group — {entity.group.name}</Label>
          <p className="text-sm text-ink-muted">
            These are members of your group, not crew. They make the music with you; crew is
            everyone else who ends up around it.
          </p>
          <ul className="flex flex-col gap-2">
            {entity.members.map((member) => (
              <li key={member.artist.id}>
                <RelationshipState
                  name={member.artist.stageName}
                  role={`${roleLabel(member.membership.role)}${
                    member.membership.isFounder ? " · founding member" : ""
                  }`}
                  standing={member.membership.satisfaction >= 65 ? "Committed" : "Settling in"}
                  tone={member.membership.satisfaction >= 65 ? "positive" : "neutral"}
                  note={member.psychology ? describePersonality(member.psychology) : undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <EmptyState
        eyebrow="Wider crew"
        title={
          isGroup
            ? "Beyond the group, you're on your own."
            : "No crew yet. Just you and the work."
        }
        description="Managers, engineers, producers, allies and the people who quietly decide whether a career happens — none of them exist for you yet. Crew relationships open in a later milestone."
        comingNext
      />

      {!isGroup ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-2">
          <Label>Note</Label>
          <p className="text-sm text-ink-muted">
            You&apos;re running a solo career, so there is no group to show here. If you ever join or
            form one, its members appear above this — separately from crew.
          </p>
        </Surface>
      ) : null}
    </AppShell>
  );
}
