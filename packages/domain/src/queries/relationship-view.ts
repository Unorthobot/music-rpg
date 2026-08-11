import { desc, eq } from "drizzle-orm";
import {
  characters,
  relationships,
  type Database,
} from "@music-rpg/database";
import { describeRelationship } from "@music-rpg/simulation";
import {
  RELATIONSHIP_DIMENSIONS,
  type RelationshipKind,
  type RelationshipNote,
  type RelationshipState,
} from "@music-rpg/shared";

/**
 * Relationships, as the player is allowed to see them.
 *
 * The same boundary reception holds, for the same reason. The simulation may
 * know tension is 26.64; the screen says "Some tension." A number invites
 * optimisation, and a player optimising a producer has stopped having a
 * relationship with one — they are grinding a stat with a face on it.
 *
 * Nothing that crosses this line is a dimension value. What crosses is a name,
 * a role, and the phrases the classifier produced.
 */

export type PersonView = {
  /** Stable id so a screen can link to them, not a value of any kind. */
  subjectId: string;
  name: string;
  /** Their part in the world — "Producer", "Connector". */
  role: string;
  quote: string | null;
  /** What they are to *this* career: "Creative partner". */
  kind: RelationshipKind;
  kindLabel: string;
  /** The two to four things worth saying, strongest first. */
  notes: RelationshipNote[];
  /** Those notes as one line. */
  line: string;
  /** How much has passed between you. A count of events, not a score. */
  interactionCount: number;
  lastInteractionAt: Date | null;
};

function stateOf(row: Record<string, unknown>): RelationshipState {
  return Object.fromEntries(
    RELATIONSHIP_DIMENSIONS.map((dimension) => [dimension, Number(row[dimension] ?? 0)]),
  ) as RelationshipState;
}

/**
 * Everyone this career has a relationship with.
 *
 * Ordered by how much history there is, so the people the player has actually
 * been through something with come first.
 */
export async function getPeople(db: Database, careerId: string): Promise<PersonView[]> {
  const rows = await db
    .select()
    .from(relationships)
    .where(eq(relationships.careerId, careerId))
    .orderBy(desc(relationships.interactionCount));

  if (rows.length === 0) return [];

  const characterRows = await db.select().from(characters);

  return rows.flatMap((row) => {
    const character = characterRows.find((entry) => entry.id === row.subjectId);
    // A relationship with somebody the world cannot name is not showable.
    if (!character) return [];

    const summary = describeRelationship(row.kind, stateOf(row));

    return [
      {
        subjectId: row.subjectId,
        name: character.name,
        role: character.role.charAt(0) + character.role.slice(1).toLowerCase(),
        quote: character.quote,
        kind: row.kind,
        kindLabel: summary.kindLabel,
        notes: summary.notes,
        line: summary.line,
        interactionCount: row.interactionCount,
        lastInteractionAt: row.lastInteractionAt,
      },
    ];
  });
}

export async function getPerson(
  db: Database,
  careerId: string,
  subjectId: string,
): Promise<PersonView | null> {
  const people = await getPeople(db, careerId);
  return people.find((person) => person.subjectId === subjectId) ?? null;
}
