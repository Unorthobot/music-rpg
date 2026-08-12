import { roundTo, type ScoutingFinding, type ScoutingReport } from "@music-rpg/shared";

/**
 * What is knowable about somebody, from what the world actually recorded.
 *
 * ## What scouting does
 *
 * It reveals. It folds facts the world already holds — who they are, what the
 * scene makes of them, what has passed between the two of you, what they have
 * done in rooms before — into one place, at one moment, and writes that down.
 *
 * ## What scouting explicitly does not do
 *
 * **It does not improve the outcome.** There is no modifier here, no bonus, and
 * no return value any judge can reach: `ScoutingReport` is not an input to
 * `performBattleRound` and is not an input to any judge, and the report is
 * persisted in its own table rather than on the performance precisely so that it
 * cannot become one by accident later.
 *
 * The value of scouting is that a *player* decides better with better
 * information — which angle to declare, whether to prepare, whether to accept at
 * all. Turning that into a hidden `+10` would have replaced a decision with a
 * button, and would have made the thing the player learns irrelevant to what
 * happens.
 *
 * ## Why the report is written down rather than recomputed
 *
 * M6's rule about moments and M7's about offers, applied again: what the world
 * knew on the day you looked is a fact about that day. Re-deriving it later would
 * quietly answer a different question using a world that has since moved, and a
 * scouting report that changed every time it was opened would not be a report.
 *
 * `unknowns` is as important as `findings`. A report that silently omitted what
 * it could not establish would imply the world knows more about a stranger than
 * it does.
 */

export type ScoutInput = {
  subjectArtistId: string;
  subjectName: string;
  /** Their public standing, as the world records it. */
  fame: number;
  respect: number;
  /** How well their home scene knows them. M7's `sceneStanding`, read. */
  sceneSlug: string;
  sceneStanding: number;
  /** What the career has actually been through with them. M6's, read. */
  relationship: { rivalry: number; respect: number; tension: number } | null;
  interactionCount: number;
  /** What the world has seen them do before. Canonical battle history. */
  priorBattles: { won: number; lost: number };
  /** Their declared angle, when it is already known. Usually it is not. */
  knownStrategy: string | null;
  scoutedAtGameTime: Date;
};

export function scoutOpponent(input: ScoutInput): ScoutingReport {
  const findings: ScoutingFinding[] = [
    {
      label: `${input.subjectName} in ${input.sceneSlug}`,
      observed: {
        sceneStanding: roundTo(input.sceneStanding, 2),
        fame: input.fame,
        respect: input.respect,
      },
      source: "SCENE",
    },
  ];

  const unknowns: { label: string; reason: string }[] = [];

  const fought = input.priorBattles.won + input.priorBattles.lost;
  if (fought > 0) {
    findings.push({
      label: "What they have done in rooms before",
      observed: { battles: fought, won: input.priorBattles.won, lost: input.priorBattles.lost },
      source: "BATTLE_HISTORY",
    });
  } else {
    unknowns.push({
      label: "How they handle a room",
      reason: "Nothing of theirs has been decided in front of anybody you can ask.",
    });
  }

  if (input.relationship && input.interactionCount > 0) {
    findings.push({
      label: "What is already between you",
      observed: {
        rivalry: roundTo(input.relationship.rivalry, 2),
        theirRespectForYou: roundTo(input.relationship.respect, 2),
        tension: roundTo(input.relationship.tension, 2),
        interactions: input.interactionCount,
      },
      source: "RELATIONSHIP",
    });
  } else {
    unknowns.push({
      label: "What they make of you",
      reason: "Nothing has actually passed between you two yet.",
    });
  }

  /*
   * The one that is almost always unknown, and should be. Knowing what somebody
   * intends to do before they do it is not scouting, and a report that guessed
   * would be inventing a fact rather than revealing one.
   */
  if (input.knownStrategy) {
    findings.push({
      label: "The angle they have said they will take",
      observed: { strategy: input.knownStrategy },
      source: "WORLD",
    });
  } else {
    unknowns.push({
      label: "What they will actually come with",
      reason: "Nobody declares an angle in advance, and guessing would not be scouting.",
    });
  }

  return {
    subjectArtistId: input.subjectArtistId,
    findings,
    unknowns,
    scoutedAtGameTime: input.scoutedAtGameTime.toISOString(),
  };
}
