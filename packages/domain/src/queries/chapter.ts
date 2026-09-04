import { and, desc, eq } from "drizzle-orm";
import { gameEvents, type CareerRow, type Database } from "@music-rpg/database";
import { GameEventType } from "@music-rpg/events";
import {
  CHAPTER_LABELS,
  CHAPTER_LINES,
  type ChapterView,
} from "@music-rpg/shared";

/**
 * Which chapter a career is in, and when it began.
 *
 * **One function, so there is one answer.** Home, Career and anything later that
 * needs the chapter read it here rather than each deciding for itself — the
 * failure this prevents is the one M7's cross-surface test was written for,
 * where every surface quietly grows its own idea of the same fact.
 *
 * Two reads and no judgement:
 *
 * - `careers.career_act`, which the day advance wrote.
 * - `career.entered_come_up`, which is the canonical record of the act
 *   changing.
 *
 * **Nothing here evaluates anything.** It does not call `decidePhase`, does not
 * read `career_progression_observations`, and does not know that recognition
 * domains exist. A screen asking which chapter a career is in must not be able
 * to cause a career to change chapter, and the surest way to guarantee that is
 * for the question to be answerable without the evaluator.
 *
 * **On the date.** `beganOn` comes from the transition event and only from it.
 * The first-reached observations record when each *kind* of recognition
 * appeared, which is a different question: a career can hold one domain for
 * weeks before a second arrives, and the chapter did not begin then.
 */
export async function getCareerChapter(
  db: Database,
  career: CareerRow,
): Promise<ChapterView> {
  const act = career.careerAct;

  const base = {
    label: CHAPTER_LABELS[act],
    line: CHAPTER_LINES[act],
  };

  /*
   * The Underground has no transition event, because a career does not *enter*
   * the chapter it starts in. That is a real absence rather than a missing
   * row, so it reads as null rather than as the career's start date.
   */
  if (act === "UNDERGROUND") {
    return { ...base, beganOn: null, beganToday: false };
  }

  const rows = await db
    .select({ occurredAt: gameEvents.occurredAt })
    .from(gameEvents)
    .where(
      and(
        eq(gameEvents.careerId, career.id),
        eq(gameEvents.eventType, GameEventType.CareerEnteredComeUp),
      ),
    )
    .orderBy(desc(gameEvents.occurredAt))
    .limit(1);

  const beganOn = rows[0]?.occurredAt ?? null;

  return {
    ...base,
    beganOn,
    /*
     * Day-of, on the career's own clock. Compared by calendar day rather than
     * by instant: the transition is stamped with the game date the day advance
     * reached, and "today" means that date, not that millisecond.
     */
    beganToday: beganOn !== null && isSameGameDay(beganOn, career.currentGameDate),
  };
}

function isSameGameDay(left: Date, right: Date): boolean {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}
