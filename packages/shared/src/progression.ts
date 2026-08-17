import type { CareerAct } from "./enums";
import type { CohortStandingFacts } from "./opportunities";
import type { MomentKind } from "./relationships";

/**
 * Career phase — the evidence vocabulary.
 *
 * > **A career phase is a classification of how the world currently relates to
 * > an artist, inferred from independent forms of recognition, and never from a
 * > total.**
 *
 * The brief said *durable* and specified a continuity window. Measurement
 * falsified it — see the note below — so the word is gone rather than kept as
 * decoration over a timer.
 *
 * Named here, before anything evaluates it, for the reason M5 named its event
 * catalogue first: a model that accumulates is a model nobody designed. Every
 * list below is closed, and the closure is the point — a family that could be
 * added at a call site is a family nobody agreed to.
 *
 * ## What is deliberately absent
 *
 * There is no score, no total, no weight, no confidence, no partial credit and
 * no percentage anywhere in this file, and there is no type through which one
 * could arrive. Named booleans, each with the value it was applied to, folded
 * into three semantic domains. If a later reader is looking for the
 * number that decides a phase, the answer is that there isn't one and that this
 * is the design rather than an omission.
 *
 * ## Activity is not evidence
 *
 * The hardest rule in the milestone, and the one every family below is shaped
 * by:
 *
 * > **No evidence family may qualify because the player performed an action.**
 * > Every family must read a judgement the world made, a threshold the world
 * > seeded, or a state change that some system other than the player's input
 * > produced.
 *
 * Released a record is activity; people staying is recognition. Booked a
 * session is activity; the producer raising `WANTS_ANOTHER_SESSION` on M6's own
 * condition is recognition. Accepted a showcase is *neither* — it is an
 * intention about the future, and it is worth nothing here until a night
 * actually happens, which today it cannot (see the performance defect in the
 * M9 brief).
 */

/** Which evaluator produced a decision. Rules change; recorded history must not. */
export const PROGRESSION_EVALUATOR_VERSION = "progression-v1";

/* --- Descriptors, which explain -------------------------------------------- */

/**
 * The named things the world can observe about a career.
 *
 * **These do not vote.** An earlier draft treated five of them as independent
 * qualifying families and justified that with a disjointness claim — that they
 * read different tables owned by different milestones, so no single quantity
 * could move more than one. Measurement falsified both halves. M8.5's live
 * performances write M5's `artist_audience`, so one night moves three of them
 * at once; and against a real reception spectrum three were true for a career
 * with five fans while one was true for nobody.
 *
 * What survived is that they are excellent *explanations*. World Control should
 * be able to say "the audience stayed", "the scene crossed a promoter's bar",
 * "one work landed", "work landed repeatedly", "somebody came back", "the scene
 * saw more than one kind of thing" — and every one of those remains available
 * here. What none of them does any more is carry a vote.
 *
 * Qualification is decided over the three domains below, into which a subset of
 * these fold.
 */
export const EVIDENCE_DESCRIPTORS = [
  /** People who did not know this artist came back, and stayed. M5's fans. */
  "AUDIENCE_THAT_STAYED",
  /** Somewhere in the city, the artist is worth building a night around. */
  "A_SCENE_THAT_KNOWS_YOU",
  /** One release met listeners properly. The RECEPTION domain reads this. */
  "WORK_LANDED_ONCE",
  /** It happened more than once. Repeated proof, and explanatory only. */
  "WORK_THAT_LANDED",
  /** Fans in more than one cohort. Explanatory: narrow and deep also counts. */
  "COHORT_BREADTH",
  /** Somebody in the world decided, unprompted, that they want more. */
  "PEOPLE_WHO_CAME_BACK",
  /** The artist is a public fact more than once, in more than one way. */
  "THINGS_THE_SCENE_SAW",
] as const;
export type EvidenceDescriptor = (typeof EVIDENCE_DESCRIPTORS)[number];

/* --- Domains, which qualify ------------------------------------------------ */

/**
 * The three ways the world can have changed how it relates to an artist.
 *
 * Semantic rather than numerical, and deliberately few. Each answers a
 * different question about recognition:
 *
 * - **RECEPTION** — did the work land with people at all?
 * - **PEER** — did a named creative person decide to keep investing?
 * - **PUBLIC_RECORD** — has the scene witnessed this artist in more than one
 *   way?
 *
 * They are not weighted, not summed and not ordered. A career either has a
 * domain or it does not.
 */
export const RECOGNITION_DOMAINS = ["RECEPTION", "PEER", "PUBLIC_RECORD"] as const;
export type RecognitionDomain = (typeof RECOGNITION_DOMAINS)[number];

/**
 * The single descriptor whose truth *is* the domain's truth.
 *
 * One each, on purpose. A domain decided by a combination of descriptors would
 * be a weighted total wearing a different word, and the measurement that
 * produced this model found no combination that classified better than the
 * single right question.
 */
export const DOMAIN_QUALIFIER: Record<RecognitionDomain, EvidenceDescriptor> = {
  RECEPTION: "WORK_LANDED_ONCE",
  PEER: "PEOPLE_WHO_CAME_BACK",
  PUBLIC_RECORD: "THINGS_THE_SCENE_SAW",
};

/**
 * Descriptors kept beside each domain to explain it, which never decide it.
 *
 * `AUDIENCE_THAT_STAYED` and `COHORT_BREADTH` describe the shape of a reception
 * that already qualified or already failed; `A_SCENE_THAT_KNOWS_YOU` is true for
 * a career with five fans and therefore explains rather than qualifies;
 * `WORK_THAT_LANDED` is the same predicate as RECEPTION's over two releases and
 * is repeated proof rather than a second vote.
 */
export const DOMAIN_EXPLAINED_BY: Record<RecognitionDomain, EvidenceDescriptor[]> = {
  RECEPTION: [
    "AUDIENCE_THAT_STAYED",
    "A_SCENE_THAT_KNOWS_YOU",
    "WORK_THAT_LANDED",
    "COHORT_BREADTH",
  ],
  PEER: [],
  PUBLIC_RECORD: [],
};

/**
 * How many domains must hold.
 *
 * Two of three, which with the invariant below yields exactly four routes: two
 * through PEER and two through PUBLIC_RECORD. Every one of them has been built
 * through real commands and measured.
 */
export const COME_UP_REQUIRED_DOMAINS = 2;

/**
 * At least one qualifying domain must be something other than RECEPTION.
 *
 * Mathematically implied by two-of-three today, and stated anyway, because it
 * is the *semantic* invariant and the arithmetic is a coincidence of there
 * being three domains:
 *
 * > **Arbitrarily large magnitude within RECEPTION alone can never cause The
 * > Come Up.**
 *
 * A record heard by everyone, converting thousands of fans, clearing every
 * promoter's bar in the city, is still one thing that happened to a career.
 * Somebody has to have decided something, or the scene has to have seen this
 * artist in more than one way. If a fourth domain is ever added this clause
 * keeps meaning what it means; the arithmetic would not.
 */
export const COME_UP_REQUIRES_NON_RECEPTION = true;

/* --- There is no durability window, and that is a finding ------------------ */

/**
 * **The durability hypothesis was measured and falsified.**
 *
 * The brief specified that breadth had to hold continuously for a window of
 * game days before a career could transition, on the reasoning that an instant
 * is not a phase. Measurement against the real world showed the window could
 * only ever be a delay:
 *
 * - RECEPTION reads cumulative counters on `release_performance`, which are
 *   monotonic. Once a record has landed it has landed.
 * - PUBLIC_RECORD reads the event log, which is append-only.
 * - PEER reads whether somebody ever decided they wanted more, which is history.
 * - No command in the codebase writes `CREW_STATUSES.LEFT`, so even crew cannot
 *   lapse.
 *
 * **No domain can fall back below its bar**, so a window can never refuse a
 * career anything — it can only postpone it. Seven, fourteen and twenty-one day
 * windows were compared and produced exactly `second-domain day + N` in every
 * history, with no lapse in ninety days. A timer that cannot fail is not a
 * measure of endurance, and calling it durability would have been a lie the
 * code told about itself.
 *
 * So there is no window, no `qualifyingSince`, no reset-on-lapse and no
 * confirmation chore. A career transitions on the first evaluation after the
 * second domain becomes true. The anti-grind property does not depend on time:
 * it comes from breadth, and Golden F fails at any reception magnitude forever.
 */

/* --- What the scene actually witnessed ------------------------------------ */

/**
 * The closed allow-list of world-witnessed facts.
 *
 * Deliberately a named vocabulary rather than `visibility === "LOCAL_PUBLIC"`,
 * because the repository already writes `LOCAL_PUBLIC` to things the scene did
 * not witness. Six event types carry that visibility today and only three of
 * them are public in any sense the world would recognise:
 *
 * - `producer.selected` and `track.saved_to_catalogue` are private acts with a
 *   public visibility tag. Counting them naively would let a career manufacture
 *   public record by finishing tracks in a room nobody was in. The tags are
 *   pre-existing, load-bearing for the World feed and **not changed by M9**;
 *   reading a named list instead is both the correction and the better
 *   discipline.
 * - `career.entered_underground` is written to every career at onboarding. A
 *   fact every career has for free discriminates nothing, and counting a
 *   career's own beginning as something the scene saw would be the phase
 *   evidencing itself.
 *
 * What is left is what actually happened in front of people.
 *
 * ## `performance.resolved`, and why only that one
 *
 * M8.5 completed the live limb this list was previously missing. The event
 * admitted here is the one that means **the night actually happened** — the
 * clock reached it, the room was played, the fee settled and the scene was
 * told. It is emitted by `resolveDuePerformances` and by nothing else.
 *
 * Deliberately *not* admitted, and each exclusion is the same rule applied:
 *
 * - **an accepted showcase.** Acceptance is a decision the player made about
 *   the future. M8.5's own golden proof asserts a career that accepted a night
 *   it has not reached has no performance evidence of any kind, and this is the
 *   consumer that assertion exists for.
 * - **`opportunity.resolved`** — the offer's bookkeeping ending, not a thing
 *   anybody watched.
 * - **`performance.performed` and `performance.consequences_applied`** — both
 *   `PRIVATE`, and both about the same night. Admitting them would let one room
 *   count as three kinds of public fact, which is exactly the failure counting
 *   kinds rather than occurrences exists to prevent.
 *
 * The coupling runs one way and through the event log only: M8.5 imports
 * nothing from progression and would behave identically if M9 never shipped.
 */
export const SCENE_WITNESSED_EVENT_TYPES = [
  "release.published",
  "battle.resolved",
  "performance.resolved",
] as const;
export type SceneWitnessedEventType = (typeof SCENE_WITNESSED_EVENT_TYPES)[number];

/**
 * How many *kinds* of public fact the scene needs to have seen.
 *
 * Kinds, never occurrences, and that distinction is the whole anti-grinding
 * property of this family: four records out is one kind. A career cannot
 * satisfy this by repeating the cheapest public act it has access to.
 */
export const SCENE_WITNESSED_KINDS_REQUIRED = 2;

/* --- What the evaluator is allowed to read -------------------------------- */

/**
 * The world, as the phase evaluator sees it.
 *
 * Every field is a fact some other system already owns and recorded, and the
 * type is the contract that keeps this a *consumer*: reception is M5's,
 * relationships and crew are M6's, the promoters' bars are the world's, and the
 * public record is the event log's. Nothing here is a number M9 invented.
 *
 * If a family needed something that is not in here, the honest move would be to
 * say so rather than to reconstruct a second version of it — a second opinion
 * about standing, reception or a relationship is a second source of truth, and
 * the first thing to go wrong under one is an explanation that no longer
 * matches the row it claims to explain.
 */
export type EvidenceFacts = {
  careerId: string;
  worldId: string;
  /** The career's own clock. The only time this model knows about. */
  currentGameTime: Date;
  /** The act the career held while the day being evaluated was lived. */
  careerAct: CareerAct;
  /**
   * M5's `artist_audience`, joined to the world's cohorts.
   *
   * The same shape the director reads, deliberately: scene standing is folded
   * from it by M7's own `sceneStanding`, which this evaluator *calls* rather
   * than reimplements.
   */
  cohorts: CohortStandingFacts[];
  /** The bars the world seeded, one per promoter who books a room. */
  sceneStandards: SceneStandardFacts[];
  /** M5's `release_performance`, one entry per record that is out. */
  releases: ReleaseReceptionFacts[];
  /** M6: the people who have decided something about this career. */
  people: PersonReturnFacts[];
  /** The allow-listed public record, counted by kind. */
  witnessed: WitnessedFacts[];
};

/**
 * One promoter's own bar for their own room.
 *
 * `standard` is the headline bar — worth building a night around. The support
 * bar is carried too, unread by any family, so the inspector can see how far
 * past merely being on a bill a career actually is.
 */
export type SceneStandardFacts = {
  sceneSlug: string;
  promoterSlug: string;
  promoterName: string;
  nightName: string;
  /** The bar for carrying the night. The one `A_SCENE_THAT_KNOWS_YOU` reads. */
  standard: number;
  /** The bar for being on the bill at all. Always lower. Kept, never read. */
  supportStandard: number;
};

/** What one record did. M5's projection, read, never recomputed. */
export type ReleaseReceptionFacts = {
  releaseId: string;
  daysSimulated: number;
  uniqueListeners: number;
  engagedListeners: number;
  /** Distinct people who came back at least once. Counted once each. */
  repeatListeners: number;
  fanConversions: number;
};

/**
 * Somebody in the world, and what they have decided about this career.
 *
 * The three satisfiers of `PEOPLE_WHO_CAME_BACK` are all here and all belong to
 * somebody else: M6 raises the moment on its own condition, the character
 * decides the crew answer through `crewDecision`, and the respect is the fold
 * over what actually happened between them. None of the three is a thing the
 * player can do unilaterally.
 */
export type PersonReturnFacts = {
  characterId: string;
  name: string;
  role: string;
  /** M6's respect dimension, 0–100. Read; never re-derived. */
  respect: number;
  creativeChemistry: number;
  interactionCount: number;
  /**
   * M6's *currently open* moments with this person. Explanatory only.
   *
   * Deliberately no longer what PEER reads. Answering somebody who asked to get
   * back in the room used to delete the evidence that they had asked, which
   * made responding to a producer cost a career its recognition — the exact
   * opposite of what the moment means.
   */
  openMomentKinds: MomentKind[];
  /**
   * Every moment kind this person has **ever** raised, whatever became of it.
   *
   * This is what PEER reads. The external decision happened at the instant they
   * wanted another session; what the player then said about it is a different
   * fact with its own consequences in M6, and none of them is "it never
   * happened". `EXPIRED` counts for the same reason — somebody came back and
   * was not answered, which is still somebody coming back.
   */
  returnedMomentKinds: MomentKind[];
  /** They were asked, and they said yes. Their decision, not the asking. */
  isCrew: boolean;
};

/** One kind of world-witnessed fact, and how often it happened. */
export type WitnessedFacts = {
  eventType: SceneWitnessedEventType;
  count: number;
};

/* --- One family, decided -------------------------------------------------- */

/**
 * A family, evaluated.
 *
 * The `EligibilityCheck` shape M7 established, applied to a phase: `observed`
 * is the actual recorded value the family was applied to, kept so a bar can be
 * disagreed with months later under a newer evaluator using the numbers the old
 * one really saw.
 *
 * **Every family is evaluated even after enough have passed**, for the reason
 * eligibility never short-circuits: "why not yet?" is usually three separate
 * things, and the failure side is the one that gets debugged.
 */
export type EvidenceCheck = {
  descriptor: EvidenceDescriptor;
  passed: boolean;
  /** Why, in plain language. Never shown to a player — World Control only. */
  reason: string;
  /** What the world actually said. Numbers, counts, names — never prose. */
  observed: Record<string, number | string | boolean | null>;
};

/**
 * Every family, plus the two conditions over them.
 *
 * `satisfied` and `anchors` are derived from `checks` rather than stored beside
 * it, so there is exactly one source of truth about which families held.
 */
export type DomainCheck = {
  domain: RecognitionDomain;
  passed: boolean;
  /** The descriptor whose truth decided it. */
  decidedBy: EvidenceDescriptor;
  reason: string;
};

export type EvidenceResult = {
  /** Every descriptor, evaluated. Explanation, never votes. */
  checks: EvidenceCheck[];
  /** The descriptors that hold, in declaration order. */
  satisfied: EvidenceDescriptor[];
  /** The three domains, each decided by exactly one descriptor. */
  domains: DomainCheck[];
  /** The domains that hold, in declaration order. */
  satisfiedDomains: RecognitionDomain[];
  /** At least `COME_UP_REQUIRED_DOMAINS` domains hold. */
  breadth: boolean;
  /** At least one holding domain is not RECEPTION. */
  beyondReception: boolean;
  /**
   * Breadth and the non-RECEPTION invariant together.
   *
   * This *is* the qualification. There is no second gate behind it — see the
   * note on the absent durability window above.
   */
  qualifying: boolean;
  evaluatorVersion: string;
};

/* --- Persisted state: when the world first said so ------------------------- */

/**
 * When each domain was **first reached**.
 *
 * Not a watermark and not qualification state. Qualification is a pure fold
 * over facts other milestones own and is recomputed whenever anybody asks; what
 * cannot be recovered from those facts is *when* each one first became true,
 * and that is career history worth keeping.
 *
 * **A first-reached timestamp never moves and never clears.** There is no lapse
 * to clear it for, and even if a later milestone introduced one, the day a
 * record first landed would still be the day it first landed.
 *
 * Every timestamp comes from the career's own clock during a day advance. There
 * is no wall-clock field and deliberately nowhere to put one.
 */
export type DomainFirstReached = Partial<Record<RecognitionDomain, Date | null>>;

export type ProgressionObservation = {
  careerId: string;
  /** The in-world day each domain first became true. Set once, never cleared. */
  domainFirstReached: DomainFirstReached;
  lastEvaluatedGameTime: Date | null;
  evaluatorVersion: string;
};

/**
 * What the observation step concluded.
 *
 * Returned rather than written by the evaluator: the calculation is pure and
 * the persistence belongs to the domain, which is the same split `direct()` and
 * the three judges already hold.
 */
export type ObservationUpdate = {
  observation: ProgressionObservation;
  /** Domains reaching their first-ever truth on this evaluation. */
  newlyReached: RecognitionDomain[];
};

/* --- The whole decision --------------------------------------------------- */

/**
 * Why this career is, or is not, leaving the Underground.
 *
 * The complete argument in one value: every descriptor with the facts it saw,
 * the three domains they fold into, when each was first reached, and the single
 * boolean that follows. World Control may show all of it. The player sees none
 * of it, ever — not the descriptors, not the domains, not a count, and above
 * all not a percentage toward The Come Up, because there is no such number and
 * nothing here from which one could be computed.
 */
export type PhaseDecision = {
  careerId: string;
  /** The act the career held while the day being evaluated was lived. */
  fromAct: CareerAct;
  currentGameTime: Date;
  evidence: EvidenceResult;
  observation: ObservationUpdate;
  /**
   * Whether the career transitions on this evaluation.
   *
   * `fromAct === "UNDERGROUND"` and qualifying. A career already past the
   * Underground is never evaluated for entering it, and the phase is monotonic.
   */
  transitions: boolean;
  /** Named, so "why not yet" is answerable without inference. */
  blockedBy: PhaseBlocker | null;
};

/** The first unmet condition, in the order the model asks them. */
export const PHASE_BLOCKERS = [
  /** The career is already past the Underground. Nothing to decide. */
  "ALREADY_TRANSITIONED",
  /** Fewer than `COME_UP_REQUIRED_DOMAINS` domains hold. */
  "NOT_ENOUGH_DOMAINS",
  /**
   * Enough domains hold, but only RECEPTION among them.
   *
   * Unreachable while two-of-three and three domains coincide, and kept because
   * the invariant is semantic: it is the named reason a runaway record alone is
   * refused, and it stays correct if the ontology ever grows.
   */
  "RECEPTION_ONLY",
] as const;
export type PhaseBlocker = (typeof PHASE_BLOCKERS)[number];
