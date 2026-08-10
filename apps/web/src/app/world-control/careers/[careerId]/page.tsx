import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCareerView } from "@music-rpg/domain";
import { gameEventLabels, listCareerEvents } from "@music-rpg/events";
import { soundDiscoverySessions, users } from "@music-rpg/database";
import { PSYCHOLOGY_KEYS, SKILL_KEYS, SOUND_DIMENSIONS, formatMoney } from "@music-rpg/shared";
import { Label, Surface } from "@music-rpg/ui";
import { getAppDb } from "@/lib/db";

/**
 * The inspector view that answers "how did this career come to exist?".
 *
 * Sound DNA, skills, psychology, traits and the full canonical event log, all
 * raw. This is the only place in the product where hidden values are shown.
 */
export default async function WorldControlCareerDetail({
  params,
}: {
  params: { careerId: string };
}) {
  const db = await getAppDb();
  const view = await getCareerView(db, params.careerId);
  if (!view) notFound();

  const [events, sessionRows, userRows] = await Promise.all([
    listCareerEvents(db, view.career.id, 200),
    db
      .select()
      .from(soundDiscoverySessions)
      .where(eq(soundDiscoverySessions.careerId, view.career.id))
      .limit(1),
    db.select().from(users).where(eq(users.id, view.career.userId)).limit(1),
  ]);

  const session = sessionRows[0];
  const account = userRows[0];
  const entity = view.entity;

  return (
    <>
      <section className="flex flex-col gap-2">
        <Label>Career</Label>
        <h1 className="text-2xl font-semibold tracking-display">{view.displayName}</h1>
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          {[
            ["Career id", view.career.id],
            ["Account", account?.email ?? "—"],
            ["World", `${view.world.name} (${view.world.id})`],
            ["Type", view.career.careerType ?? "—"],
            ["Status", `${view.career.status} · ${view.career.onboardingState}`],
            ["Act", view.career.careerAct],
            ["Controls", `${view.career.controlledEntityType ?? "—"} ${view.career.controlledEntityId ?? ""}`],
            ["Money", formatMoney(view.career.moneyBalance)],
            [
              "Metrics",
              `fame ${view.career.fame} · respect ${view.career.respect} · heat ${view.career.heat} · legacy ${view.career.legacy}`,
            ],
            ["Scene", view.scene?.name ?? "—"],
            ["Started", new Date(view.career.startedAt).toISOString()],
            [
              "Onboarding completed",
              view.career.onboardingCompletedAt
                ? new Date(view.career.onboardingCompletedAt).toISOString()
                : "—",
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-2xs uppercase tracking-label text-ink-subtle">{label}</dt>
              <dd className="text-ink font-mono text-xs break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {entity?.sound ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-3">
          <Label>Sound DNA</Label>
          <p className="text-sm text-ink-muted">{entity.soundSummary}</p>
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-4 text-xs font-mono">
            {SOUND_DIMENSIONS.map((axis) => (
              <span key={axis} className="text-ink-muted">
                {axis}: <span className="text-ink">{entity.sound![axis].toFixed(3)}</span>
              </span>
            ))}
          </div>
        </Surface>
      ) : null}

      {entity?.type === "ARTIST" ? (
        <>
          <Surface level={1} padded="lg" className="flex flex-col gap-3">
            <Label>Skills</Label>
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-3 text-xs font-mono">
              {SKILL_KEYS.map((key) => (
                <span key={key} className="text-ink-muted">
                  {key}: <span className="text-ink">{entity.skills[key]}</span>
                </span>
              ))}
            </div>
          </Surface>

          <Surface level={1} padded="lg" className="flex flex-col gap-3">
            <Label>Psychology</Label>
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-3 text-xs font-mono">
              {PSYCHOLOGY_KEYS.map((key) => (
                <span key={key} className="text-ink-muted">
                  {key}: <span className="text-ink">{entity.psychology[key]}</span>
                </span>
              ))}
            </div>
          </Surface>

          <Surface level={1} padded="lg" className="flex flex-col gap-2">
            <Label>Traits</Label>
            {entity.traits.length === 0 ? (
              <span className="text-sm text-ink-subtle">None</span>
            ) : (
              <ul className="text-xs font-mono text-ink-muted">
                {entity.traits.map((trait) => (
                  <li key={trait.key}>
                    {trait.key}: <span className="text-ink">{trait.strength}</span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </>
      ) : null}

      {entity?.type === "GROUP" ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-2">
          <Label>Members</Label>
          <ul className="text-xs font-mono text-ink-muted flex flex-col gap-1">
            {entity.members.map((member) => (
              <li key={member.artist.id}>
                {member.artist.stageName} — {member.membership.role} · influence{" "}
                {member.membership.influence} · satisfaction {member.membership.satisfaction} ·
                commitment {member.membership.commitment} · solo ambition{" "}
                {member.membership.soloAmbition}
                {member.membership.isFounder ? " · founder" : ""}
              </li>
            ))}
          </ul>
          <span className="text-xs text-ink-subtle">Chemistry: {entity.group.chemistry}</span>
        </Surface>
      ) : null}

      {session ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-2">
          <Label>Sound discovery — {session.status}</Label>
          <pre className="text-xs font-mono text-ink-muted overflow-x-auto">
            {JSON.stringify(session.responses, null, 2)}
          </pre>
        </Surface>
      ) : null}

      <section className="flex flex-col gap-3">
        <Label>Canonical events ({events.length})</Label>
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-xs min-w-[860px]">
            <thead className="bg-surface-2 text-ink-subtle uppercase tracking-label">
              <tr>
                <th className="text-left font-medium px-3 py-2">#</th>
                <th className="text-left font-medium px-3 py-2">Type</th>
                <th className="text-left font-medium px-3 py-2">Actor</th>
                <th className="text-left font-medium px-3 py-2">Target</th>
                <th className="text-left font-medium px-3 py-2">Vis</th>
                <th className="text-left font-medium px-3 py-2">Imp</th>
                <th className="text-left font-medium px-3 py-2">Occurred</th>
                <th className="text-left font-medium px-3 py-2">Payload</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {events.map((event) => (
                <tr key={event.id} className="border-t border-line-subtle align-top">
                  <td className="px-3 py-2 text-ink-subtle">{event.sequence}</td>
                  <td className="px-3 py-2 text-ink">
                    {gameEventLabels[event.eventType as keyof typeof gameEventLabels] ??
                      event.eventType}
                    <div className="text-ink-subtle">{event.eventType}</div>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {event.actorType}
                    <div className="text-ink-subtle break-all">{event.actorId}</div>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {event.targetType ?? "—"}
                    <div className="text-ink-subtle break-all">{event.targetId}</div>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{event.visibility}</td>
                  <td className="px-3 py-2 text-ink-muted">{event.importance}</td>
                  <td className="px-3 py-2 text-ink-subtle">
                    {new Date(event.occurredAt).toISOString()}
                  </td>
                  <td className="px-3 py-2 text-ink-subtle max-w-[280px]">
                    <pre className="whitespace-pre-wrap break-all">
                      {JSON.stringify(event.payload)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
