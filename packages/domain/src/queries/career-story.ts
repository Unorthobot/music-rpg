import { asc, desc, eq } from "drizzle-orm";
import {
  calendarItems,
  characters,
  opportunities,
  type CareerRow,
  type Database,
  type OpportunityRow,
} from "@music-rpg/database";
import {
  BILLING_PAST_TENSE,
  type PlayerOfferOutcome,
  type ShowcaseBilling,
} from "@music-rpg/shared";

/**
 * What became history.
 *
 * A career's story, read back from the offers it was actually made and what
 * became of each one. The four endings stay four, because they are four
 * different things that happened to a person:
 *
 *     Headlined The live room, Newtown
 *     Turned down Naledi's rooftop slot
 *     Rooftop hours lapsed — Naledi filled the slot
 *     Dineo's basement became unavailable after you booked another night
 *
 * Flattening those into "closed" would be the easy version and the wrong one.
 * The difference between turning something down and letting it rot is most of
 * what a year of a career is, and the person who offered may well remember which.
 *
 * **Nothing here is written prose about events that did not happen.** Every entry
 * is derived from a persisted offer row and the lifecycle timestamp that ended
 * it — the same rows, and the same instants, that the events log records. A
 * history that narrated more than the world recorded would be the most damaging
 * possible thing to put on this screen.
 */

export type StoryEntry = {
  id: string;
  /** "Offer", "Studio", "Release" — what kind of thing this was. */
  eyebrow: string;
  /** The whole entry in one line, in the player's language. */
  line: string;
  /** Where it goes when there is somewhere to go. */
  href: string | null;
  /** In game time. History is dated by the world, not by the server. */
  occurredAt: Date;
  outcome: PlayerOfferOutcome;
};

type StoryPayload = {
  nightName?: string;
  sceneName?: string;
  billing?: ShowcaseBilling;
  promoterName?: string;
  producerName?: string;
};

/**
 * The instant an offer reached the state it is in. Never `updatedAt`.
 *
 * `resolvedAt` is checked before `acceptedAt` because a resolved offer's ending
 * is the resolution, not the agreement that preceded it. For a session this is
 * a distinction without a difference — accepting books the room and stamps both
 * in the same transaction — but a showcase is agreed on one date and played on
 * another, and dating a night by when it was booked would put it in the story
 * at a time nobody was on stage.
 */
function endedAt(row: OpportunityRow): Date {
  return (
    row.declinedAt ??
    row.expiredAt ??
    row.withdrawnAt ??
    row.resolvedAt ??
    row.acceptedAt ??
    row.generatedAtGameTime ??
    row.createdAt
  );
}

/**
 * Whether accepting an offer is, by itself, the thing having happened.
 *
 * For most offers it is. Accepting a session invitation books the room through
 * `bookProducerSession` in the same transaction — the studio exists, the money
 * has moved, and "Back in the studio with Thabo" is true the moment it is
 * agreed. A producer introduction is the same: choosing is the act.
 *
 * **A showcase is not.** Accepting one writes a date in the diary and nothing
 * else. The night happens when game time reaches it, which may be a week later
 * and is not guaranteed to have occurred at all — that is the whole subject of
 * M8.5. Until then there is no `performances` row, no fee and no public fact.
 *
 * This distinction was invisible until M8.5, because `RESOLVED` was unreachable
 * for showcases: `ACCEPTED` was the only state one could ever be observed in, so
 * treating it as history had exactly one meaning. Now the same status means
 * "agreed to, still ahead", and rendering it as `TAKEN` would put
 * *"Opened Rooftop hours, Braamfontein"* — past tense, in a history list — above
 * a night nobody has played yet.
 */
function acceptanceIsTheEvent(row: OpportunityRow): boolean {
  return row.type !== "SHOWCASE_SLOT";
}

function outcomeOf(row: OpportunityRow): PlayerOfferOutcome | null {
  switch (row.status) {
    case "ACCEPTED":
      /*
       * A booked night is a commitment, not history. It belongs to the Calendar
       * until the clock reaches it — and the `default` branch below already says
       * why putting a thing that has not happened here would be wrong.
       */
      return acceptanceIsTheEvent(row) ? "TAKEN" : null;
    case "RESOLVED":
      return "TAKEN";
    case "DECLINED":
      return "TURNED_DOWN";
    case "EXPIRED":
      return "LAPSED";
    case "WITHDRAWN":
      return "GONE";
    default:
      // Still waiting. Not history yet, and putting it here would make the
      // story a to-do list.
      return null;
  }
}

/**
 * One ending, in a sentence.
 *
 * Written per outcome rather than as a template with an outcome word slotted in,
 * because these are not variations on a sentence — "you took it" and "they
 * stopped waiting" have different subjects, and the one whose subject is the
 * promoter is the one that carries the sting.
 */
function lineFor(
  row: OpportunityRow,
  outcome: PlayerOfferOutcome,
  names: { source: string | null; displacedBy: string | null },
): string {
  const payload = row.payload as StoryPayload;
  const who = names.source ?? payload.promoterName ?? payload.producerName ?? "Someone";
  const room = [payload.nightName, payload.sceneName].filter(Boolean).join(", ");

  if (row.type === "SESSION_INVITE") {
    switch (outcome) {
      case "TAKEN":
        return `Back in the studio with ${who}`;
      case "TURNED_DOWN":
        return `Turned down another session with ${who}`;
      case "LAPSED":
        return `${who} filled the week`;
      case "GONE":
        return `${who}'s session fell away after you booked something else`;
      default:
        return `${who} asked for another session`;
    }
  }

  if (row.type === "PRODUCER_INTRO") {
    return outcome === "TAKEN" ? "Chose a producer and booked the first session" : "";
  }

  switch (outcome) {
    case "TAKEN": {
      // "Headlined" and "Opened" say which end of the bill without ever naming
      // a billing, which is the whole boundary in two words.
      const verb = payload.billing ? BILLING_PAST_TENSE[payload.billing] : "Took a slot at";
      return `${verb} ${room || "a night"}`;
    }
    case "TURNED_DOWN":
      return `Turned down ${who}'s ${payload.nightName ?? "night"}`;
    case "LAPSED":
      return `${payload.nightName ?? "A night"} lapsed — ${who} filled the slot`;
    case "GONE":
      return names.displacedBy
        ? `${payload.nightName ?? "A night"} became unavailable — you took ${names.displacedBy} instead`
        : `${payload.nightName ?? "A night"} became unavailable after you booked another night`;
    default:
      return "";
  }
}

/**
 * Every offer that has finished, newest first.
 *
 * Survives reload and time progression because it is not built from anything
 * transient: the rows are permanent and their endings are timestamped.
 */
export async function getOfferStory(
  db: Database,
  career: CareerRow,
  limit = 20,
): Promise<StoryEntry[]> {
  const [rows, people, bookings] = await Promise.all([
    db
      .select()
      .from(opportunities)
      .where(eq(opportunities.careerId, career.id))
      .orderBy(desc(opportunities.updatedAt)),
    db.select().from(characters).where(eq(characters.worldId, career.worldId)),
    db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.careerId, career.id))
      .orderBy(asc(calendarItems.startGameTime)),
  ]);

  const nameOf = (id: string | null): string | null =>
    people.find((person) => person.id === id)?.name ?? null;

  const entries: StoryEntry[] = [];

  for (const row of rows) {
    const outcome = outcomeOf(row);
    if (!outcome) continue;

    const displacing = row.withdrawnForOpportunityId
      ? rows.find((entry) => entry.id === row.withdrawnForOpportunityId)
      : undefined;

    const line = lineFor(row, outcome, {
      source: nameOf(row.sourceEntityId),
      displacedBy: displacing
        ? ((displacing.payload as StoryPayload).nightName ??
          nameOf(displacing.sourceEntityId) ??
          null)
        : null,
    });

    if (!line) continue;

    entries.push({
      id: row.id,
      eyebrow: "Offer",
      line,
      /*
       * A taken offer points at what it became; everything else points at the
       * offer, which still exists and still explains itself. Nothing is deleted
       * from history because it did not happen.
       */
      href:
        row.type === "PRODUCER_INTRO"
          ? null
          : outcome === "TAKEN"
            ? (bookings.find(
                (item) =>
                  item.relatedEntityType === "OPPORTUNITY" && item.relatedEntityId === row.id,
              )
                ? "/calendar"
                : `/opportunities/${row.id}`)
            : `/opportunities/${row.id}`,
      occurredAt: endedAt(row),
      outcome,
    });
  }

  return entries
    .sort((first, second) => second.occurredAt.getTime() - first.occurredAt.getTime())
    .slice(0, limit);
}
