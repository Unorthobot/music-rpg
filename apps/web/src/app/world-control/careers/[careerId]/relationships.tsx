import {
  getCareerRelationships,
  getRelationshipDecisions,
  getRelationshipHistory,
} from "@music-rpg/domain";
import { describeRelationship } from "@music-rpg/simulation";
import {
  RELATIONSHIP_DIMENSIONS,
  type RelationshipState,
} from "@music-rpg/shared";
import type { Database } from "@music-rpg/database";
import { Label, Surface } from "@music-rpg/ui";

/**
 * Relationship inspection.
 *
 * The question this section exists to answer is "why does LEX have tension with
 * KXMO?", and it answers it in the order the derivation did:
 *
 *     creative decision → interaction → delta → resulting state → event
 *
 * Raw values live here and only here. If a phrase on the Crew screen cannot be
 * traced back through these tables to a decision somebody actually made, the
 * relationship is fiction.
 */
export async function CareerRelationships({
  db,
  careerId,
}: {
  db: Database;
  careerId: string;
}) {
  const rows = await getCareerRelationships(db, careerId);

  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <Label>Relationships</Label>
        <p className="text-sm text-ink-subtle">
          Nothing has passed between this career and anybody yet.
        </p>
      </section>
    );
  }

  const detail = await Promise.all(
    rows.map(async ({ relationship, character }) => ({
      relationship,
      character,
      history: await getRelationshipHistory(db, careerId, relationship.subjectId),
      decisions: await getRelationshipDecisions(db, careerId, relationship.subjectId),
    })),
  );

  return (
    <>
      {detail.map(({ relationship, character, history, decisions }) => {
        const state = Object.fromEntries(
          RELATIONSHIP_DIMENSIONS.map((dimension) => [dimension, relationship[dimension]]),
        ) as RelationshipState;
        const summary = describeRelationship(relationship.kind, state);

        return (
          <Surface key={relationship.id} level={1} padded="lg" className="flex flex-col gap-5">
            <Label>
              Relationship — {character?.name ?? relationship.subjectId} ({relationship.kind})
            </Label>

            {/* 1. What the player is told, beside what it was derived from. */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                what the player sees
              </span>
              <span className="text-sm text-ink">{summary.line}</span>
            </div>

            {/* 2. The values behind it. */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">state</span>
              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-4 text-xs font-mono">
                {RELATIONSHIP_DIMENSIONS.map((dimension) => (
                  <span key={dimension} className="text-ink-muted">
                    {dimension}: <span className="text-ink">{state[dimension].toFixed(3)}</span>
                  </span>
                ))}
              </div>
              <span className="text-xs font-mono text-ink-subtle break-all">
                interactions {relationship.interactionCount} · derived through sequence{" "}
                {relationship.derivedThroughSequence} · engine {relationship.engineVersion}
              </span>
            </div>

            {/* 3. The decisions underneath, in the order they were made. */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                creative decisions in sessions with this person ({decisions.length})
              </span>
              <ol className="text-xs font-mono text-ink-muted flex flex-col gap-1">
                {decisions.map(({ decision }) => (
                  <li key={decision.id} className="break-all">
                    #{decision.sequence} {decision.decisionType}{" "}
                    <span className="text-ink-subtle">{JSON.stringify(decision.payload)}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* 4. What each interaction was worth, and to which dimension. */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                derived deltas ({history.length}{" "}
                {history.length === 1 ? "change" : "changes"})
              </span>
              <div className="overflow-x-auto rounded-md border border-line-subtle">
                <table className="w-full text-xs min-w-[720px] font-mono">
                  <thead className="bg-surface-2 text-ink-subtle uppercase tracking-label">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Seq</th>
                      <th className="text-left font-medium px-3 py-2">Interaction</th>
                      <th className="text-left font-medium px-3 py-2">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.flatMap((change) =>
                      change.interactions.map((interaction, index) => (
                        <tr
                          key={`${change.event.id}-${index}`}
                          className="border-t border-line-subtle"
                        >
                          <td className="px-3 py-2 text-ink-subtle">{change.event.sequence}</td>
                          <td className="px-3 py-2 text-ink">{interaction.kind}</td>
                          <td className="px-3 py-2 text-ink-muted break-all">
                            {Object.entries(interaction.delta)
                              .filter(([, value]) => value !== 0)
                              .map(
                                ([dimension, value]) =>
                                  `${dimension} ${value > 0 ? "+" : ""}${Number(value).toFixed(2)}`,
                              )
                              .join(" · ") || "—"}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
              <span className="text-2xs text-ink-subtle">
                Every value above is attributable to one recorded interaction. Nothing here is
                awarded.
              </span>
            </div>
          </Surface>
        );
      })}
    </>
  );
}
