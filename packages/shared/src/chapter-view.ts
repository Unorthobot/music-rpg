import type { CareerAct } from "./enums";

/**
 * A career chapter, as a player is allowed to see it.
 *
 * The product boundary for M9, expressed as a type — the same discipline
 * `PlayerOffer` and `BattleView` apply to their own dangerous rows. Behind this
 * shape sit three recognition domains, seven evidence descriptors with the
 * values they were applied to, three first-reached timestamps, an evaluator
 * version and a named blocker. **None of it belongs in front of somebody whose
 * career just changed**, and none of it is reachable from here.
 *
 * ## Why this is a type and not a review checklist
 *
 * `decidePhase` returns a `PhaseDecision`, which carries every domain, every
 * descriptor and the reason a career has not qualified — so
 * `decision.evidence.satisfiedDomains.length` is three dots away and
 * typechecks. Nothing in this file contains a domain, a descriptor, a
 * threshold, a count or a blocker, so the same expression **does not compile**
 * against a `ChapterView`. A screen that wants to know why a career has not come
 * up has to come here and add a field, which is the conversation the boundary
 * exists to force.
 *
 * ## What a chapter is
 *
 * A named stretch of a career, with a beginning, describing **how the world
 * relates to this artist** — never what the player must do next. The label and
 * the line are fiction; `beganOn` is the one fact, and it comes from the
 * canonical transition event rather than from any observation about why.
 */
export type ChapterView = {
  /** "The Underground", "The Come Up". */
  label: string;
  /** How the world relates to this artist now. Never an objective. */
  line: string;
  /**
   * The game date this chapter began.
   *
   * Null for The Underground, which has no transition event — a career does not
   * *enter* the chapter it starts in. For The Come Up this is
   * `career.entered_come_up`.`occurredAt` and **nothing else**: not a
   * first-reached timestamp, not the earliest qualifying domain, not the day
   * the second domain arrived. Those record when the world produced each kind
   * of recognition, which is a different question from when the act changed.
   */
  beganOn: Date | null;
  /**
   * True only while `beganOn` falls on the career's current game date.
   *
   * Drives Home's day-of-transition line. Derived from the world clock on every
   * read, so it needs no `seen_at`, no dismissal and no consumption — and so
   * looking at a screen can never change it. It stops being true because the
   * career's clock moved, never because somebody looked.
   */
  beganToday: boolean;
};

/**
 * What each chapter is called.
 *
 * Named, never numbered. There is no "Act II" because a career is not a game
 * with levels in it.
 */
export const CHAPTER_LABELS: Record<CareerAct, string> = {
  UNDERGROUND: "The Underground",
  COME_UP: "The Come Up",
  INDUSTRY: "The Industry",
  LEGACY: "Legacy",
};

/**
 * How the world relates to the artist in each chapter.
 *
 * These replace an earlier set of imperatives — *"Get noticed."*, *"Turn
 * attention into a career."* — which read as objectives handed to the player. A
 * chapter describes a relationship; it does not assign a task, because the
 * player is not working towards the next one and must never be told they are.
 *
 * `UNDERGROUND` and `COME_UP` are written here. `INDUSTRY` and `LEGACY` keep
 * their placeholder wording deliberately: M9 establishes the grammar, and the
 * content of a chapter belongs to the milestone that ships it.
 */
export const CHAPTER_LINES: Record<CareerAct, string> = {
  UNDERGROUND: "Nobody knows the name yet.",
  COME_UP: "The name is starting to travel.",
  INDUSTRY: "Decide what to do with influence.",
  LEGACY: "What outlasts you.",
};

/**
 * The line the World feed carries when a career comes up.
 *
 * Third person, because the World feed is what the scene saw. The artist is
 * already named beside it by the card's own description, so this says only what
 * changed.
 *
 * **Everything this sentence claims is carried by `career.entered_come_up`
 * alone.** That event knows an artist, a world, a game date and the fact that
 * the act changed. It does not know who noticed, what they said, which record
 * did it, or which of the four routes qualified the career — so this line
 * invents no press, no chatter, no industry interest and no collaborator
 * reaction, and it reads identically whether the career came up through a
 * producer, a crew member, a battle or a night.
 *
 * "Travel" rather than "people know it": the stronger phrasing implies a
 * population-level claim about listeners that the transition event does not
 * make.
 */
export const COME_UP_WORLD_LINE = "The name is starting to travel.";

/**
 * The same fact, addressed to the player.
 *
 * Used by Notifications and by Home on the day it happened. Second person, no
 * congratulation, and no instruction about what to do with it.
 */
export const COME_UP_PLAYER_LINE = "Your name is starting to travel.";
