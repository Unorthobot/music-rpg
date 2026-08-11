import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  careers,
  characters,
  eq,
  gameEvents,
  relationships,
  type UserRow,
} from "@music-rpg/database";
import { GameEventType } from "@music-rpg/events";
import {
  advanceCareerDay,
  getCrew,
  getCrewEligibility,
  getMomentHistory,
  getOpenMoments,
  getPeople,
  inviteToCrew,
  respondToMoment,
  surfaceRelationshipMoments,
  getRelationshipDecisions,
  getRelationshipHistory,
  syncCareerRelationships,
} from "@music-rpg/domain";
import { describeRelationship } from "@music-rpg/simulation";
import {
  RELATIONSHIP_DIMENSIONS,
  unwrap,
  type RelationshipState,
} from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makePublishedRelease } from "../helpers/release";

/**
 * The golden proof.
 *
 * > Same two people, different shared history → different relationship state,
 * > explainable from the recorded events.
 *
 * The relationship equivalent of M5's sensitivity test, and it has the same two
 * halves. A derivation that ignored its history would pass a determinism check
 * on its own, so what is asserted here is that the histories *diverge* — and
 * that they diverge in the directions the rules say they should.
 *
 * The other thing being protected is honesty about what one session can do.
 * Familiarity and loyalty are longitudinal: they are earned by coming back, by
 * standing by somebody through a record that failed, by choosing them again.
 * After one session both careers barely know LEX, and the test says so rather
 * than manufacturing a difference the simulation has no right to claim.
 */

type Run = {
  state: RelationshipState;
  interactionCount: number;
  close: () => Promise<void>;
  test: TestContext;
  careerId: string;
  userId: string;
};

async function liveThroughASession(options: {
  friction: boolean;
  stageName: string;
  title: string;
}): Promise<Run> {
  const test = await createTestContext();
  const user = await createTestUser(test, options.stageName);

  const { careerId } = await makePublishedRelease(test, user, options.title, {
    stageName: options.stageName,
    ...(options.friction ? { friction: true } : {}),
  });

  // Three days of the world reacting to what they made together.
  for (let day = 0; day < 3; day += 1) {
    unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id }));
  }

  unwrap(await syncCareerRelationships(test.ctx, { careerId, userId: user.id }));

  const [row] = await test.handle.db
    .select()
    .from(relationships)
    .where(eq(relationships.careerId, careerId));

  const state = Object.fromEntries(
    RELATIONSHIP_DIMENSIONS.map((dimension) => [dimension, row![dimension]]),
  ) as RelationshipState;

  return {
    state,
    interactionCount: row!.interactionCount,
    close: test.close,
    test,
    careerId,
    userId: user.id,
  };
}

describe("a relationship is folded out of what actually happened", () => {
  let clean: Run;
  let friction: Run;

  beforeAll(async () => {
    clean = await liveThroughASession({
      friction: false,
      stageName: "KXMO",
      title: "CLEAN RUN",
    });
    friction = await liveThroughASession({
      friction: true,
      stageName: "NOKX",
      title: "HARD WON",
    });
  }, 120_000);

  afterAll(async () => {
    await clean.close();
    await friction.close();
  });

  it("knows who was in the room", async () => {
    const [row] = await clean.test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, clean.careerId));

    const [producer] = await clean.test.handle.db
      .select()
      .from(characters)
      .where(eq(characters.slug, "lex"));

    expect(row!.subjectType).toBe("CHARACTER");
    expect(row!.subjectId).toBe(producer!.id);
    expect(row!.kind).toBe("CREATIVE_PARTNER");
    expect(row!.interactionCount).toBeGreaterThan(0);
  });

  it("keeps familiarity and loyalty low on both paths, because one session is one session", () => {
    for (const run of [clean, friction]) {
      expect(run.state.familiarity).toBeLessThan(24);
      expect(run.state.loyalty).toBeLessThan(24);
    }

    // And neither path buys its way past the other on time served.
    expect(Math.abs(clean.state.familiarity - friction.state.familiarity)).toBeLessThan(12);
  });

  it("produces a different relationship from a different history", () => {
    expect(friction.state).not.toEqual(clean.state);
    expect(friction.interactionCount).toBeGreaterThan(clean.interactionCount);
  });

  it("charges friction to tension, not to trust", () => {
    // The thing that was unresolved between them is unresolved on one path and
    // not the other.
    expect(friction.state.tension).toBeGreaterThan(clean.state.tension);

    /*
     * And trust does not pay for it. Refusing somebody's opening read and then
     * coming back, taking their second pass, working it again and finishing the
     * record is the collaboration working — not a betrayal. Trust answers
     * follow-through, and both of these careers followed through.
     */
    expect(friction.state.trust).toBeGreaterThan(0);
    expect(friction.state.trust).toBeGreaterThan(clean.state.trust * 0.8);
  });

  it("pays pushing for something better into respect", () => {
    // Demanding more and then delivering earns more than taking the first
    // thing offered.
    expect(friction.state.respect).toBeGreaterThan(clean.state.respect);
  });

  it("lets a relationship be strong and tense at the same time", () => {
    // The state this whole model exists to be able to express.
    expect(friction.state.creativeChemistry).toBeGreaterThan(24);
    expect(friction.state.respect).toBeGreaterThan(24);
    expect(friction.state.tension).toBeGreaterThan(24);
  });

  it("explains itself from the events it consumed", async () => {
    const events = await friction.test.handle.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.careerId, friction.careerId));

    const changed = events.filter(
      (event) => event.eventType === GameEventType.RelationshipChanged,
    );
    expect(changed.length).toBeGreaterThan(0);

    const payload = changed[0]!.payload as {
      interactions: { kind: string; delta: Record<string, number> }[];
    };

    // The refusal is in the record, and it is what moved tension.
    const refusal = payload.interactions.find((entry) => entry.kind === "IDEAS_REFUSED")!;
    expect(refusal).toBeTruthy();
    expect(refusal.delta.tension).toBeGreaterThan(0);
    // It did not cost meaningful trust.
    expect(Math.abs(refusal.delta.trust ?? 0)).toBeLessThan(3);

    // And the revision that produced a master reads as convergence.
    const revision = payload.interactions.find((entry) => entry.kind === "REVISION_ASKED")!;
    expect(revision.delta.creativeChemistry).toBeGreaterThan(0);
  });

  it("says it in words, without ever showing a number", () => {
    const summary = describeRelationship("CREATIVE_PARTNER", friction.state);

    expect(summary.kindLabel).toBe("Creative partner");
    expect(summary.notes.length).toBeGreaterThan(1);
    expect(summary.line).not.toMatch(/[0-9]/);

    // Tension is reported rather than hidden: it is part of what this
    // relationship is, not a fault to be tidied away.
    expect(summary.notes.some((note) => note.dimension === "tension")).toBe(true);
  });

  it("consumes nothing on a second pass", async () => {
    const before = await friction.test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, friction.careerId));

    const again = unwrap(
      await syncCareerRelationships(friction.test.ctx, {
        careerId: friction.careerId,
        userId: friction.userId,
      }),
    );

    expect(again.consumed).toBe(0);

    const after = await friction.test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, friction.careerId));

    expect(after[0]!.trust).toBe(before[0]!.trust);
    expect(after[0]!.tension).toBe(before[0]!.tension);
    expect(after[0]!.interactionCount).toBe(before[0]!.interactionCount);
  });
});

/**
 * The boundary.
 *
 * The simulation knows the number; the player knows the person. Anything on
 * this list reaching a player view is the bug — the same guard reception holds,
 * for the same reason.
 */
const FORBIDDEN_KEYS = [
  ...RELATIONSHIP_DIMENSIONS,
  "derivedThroughSequence",
  "engineVersion",
  "state",
  "delta",
  "interactions",
];

function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) keysOf(entry, found);
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      found.add(key);
      keysOf(nested, found);
    }
  }
  return found;
}

describe("what the player is told about a person", () => {
  let run: Run;

  beforeAll(async () => {
    run = await liveThroughASession({
      friction: true,
      stageName: "VIEWKX",
      title: "SEEN FROM OUTSIDE",
    });
  }, 120_000);

  afterAll(async () => {
    await run.close();
  });

  it("names the person and what they are to this career", async () => {
    const people = await getPeople(run.test.handle.db, run.careerId);

    expect(people).toHaveLength(1);
    const lex = people[0]!;

    expect(lex.name).toBe("LEX");
    expect(lex.role).toBe("Producer");
    expect(lex.kindLabel).toBe("Creative partner");
    expect(lex.interactionCount).toBeGreaterThan(0);
  });

  it("says it in phrases, and never in values", async () => {
    const people = await getPeople(run.test.handle.db, run.careerId);
    const lex = people[0]!;

    // The dimension a hard session earned is reported, in words.
    expect(lex.notes.some((note) => note.dimension === "tension")).toBe(true);
    expect(lex.line).toMatch(/tension/i);

    // And no dimension value crosses, under any name.
    const keys = keysOf(people);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys.has(forbidden), `the player view exposes "${forbidden}"`).toBe(false);
    }

    // Not even incidentally, as a formatted string.
    expect(JSON.stringify(people.map((person) => person.line))).not.toMatch(/[0-9]/);
  });

  it("can be traced back to the decisions that produced it", async () => {
    const [lex] = await getPeople(run.test.handle.db, run.careerId);

    const [history, decisions] = await Promise.all([
      getRelationshipHistory(run.test.handle.db, run.careerId, lex!.subjectId),
      getRelationshipDecisions(run.test.handle.db, run.careerId, lex!.subjectId),
    ]);

    // The inspector's side keeps everything the player's side refuses.
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]!.state.tension).toBeGreaterThan(0);

    // And the decisions underneath are the ones made in rooms with this person.
    expect(decisions.map((entry) => entry.decision.decisionType)).toContain(
      "PRODUCER_PROPOSAL_REJECTED",
    );
    expect(decisions.map((entry) => entry.decision.decisionType)).toContain("REVISION_REQUESTED");
  });
});

/**
 * Crew is a different thing from collaboration.
 *
 * The distinction the milestone exists to draw: working with LEX makes him a
 * collaborator, and nothing more. Being crew has to be asked for, agreed to,
 * and given terms — and he is allowed to say no.
 */
describe("becoming crew", () => {
  let run: Run;

  beforeAll(async () => {
    run = await liveThroughASession({
      friction: true,
      stageName: "CREWKX",
      title: "WORTH THE TIME",
    });
  }, 120_000);

  afterAll(async () => {
    await run.close();
  });

  const lex = async () => {
    const [row] = await run.test.handle.db
      .select()
      .from(characters)
      .where(eq(characters.slug, "lex"));
    return row!;
  };

  it("does not make somebody crew just because you worked with them", async () => {
    // A finished record, a release, three days of reception — and no crew.
    const crew = await getCrew(run.test.ctx, run.careerId);
    expect(crew).toHaveLength(0);

    // The relationship is real, though. Collaborator, not team.
    const people = await getPeople(run.test.handle.db, run.careerId);
    expect(people).toHaveLength(1);
  });

  it("refuses to ask somebody the career has never worked with", async () => {
    const [thabo] = await run.test.handle.db
      .select()
      .from(characters)
      .where(eq(characters.slug, "thabo"));

    const eligibility = await getCrewEligibility(run.test.ctx, {
      careerId: run.careerId,
      subjectId: thabo!.id,
    });

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toMatch(/haven't worked together/i);

    const result = await inviteToCrew(run.test.ctx, {
      careerId: run.careerId,
      userId: run.userId,
      subjectId: thabo!.id,
      arrangement: "SESSION_RATE",
    });
    expect(result.ok).toBe(false);
  });

  it("lets a real collaborator be asked, and answers in their own voice", async () => {
    const producer = await lex();

    const eligibility = await getCrewEligibility(run.test.ctx, {
      careerId: run.careerId,
      subjectId: producer.id,
    });
    expect(eligibility.eligible).toBe(true);

    const result = unwrap(
      await inviteToCrew(run.test.ctx, {
        careerId: run.careerId,
        userId: run.userId,
        subjectId: producer.id,
        arrangement: "REVENUE_SHARE",
        note: "I want you on everything.",
      }),
    );

    expect(result.accepted).toBe(true);
    expect(result.line).toBeTruthy();
    expect(result.line).not.toMatch(/[0-9]/);

    // The terms are part of the deal, so they are kept.
    expect(result.member.status).toBe("ACTIVE");
    expect(result.member.terms.arrangement).toBe("REVENUE_SHARE");
    expect(result.member.terms.note).toBe("I want you on everything.");
    expect(result.member.joinedAtGameTime).toBeTruthy();

    const crew = await getCrew(run.test.ctx, run.careerId);
    expect(crew).toHaveLength(1);
    expect(crew[0]!.character!.name).toBe("LEX");
  });

  it("moves loyalty through the fold, not by writing it directly", async () => {
    const before = (await getPeople(run.test.handle.db, run.careerId))[0]!;

    const [rowBefore] = await run.test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, run.careerId));

    // Joining is a canonical event; the derivation is what reads it.
    unwrap(
      await syncCareerRelationships(run.test.ctx, {
        careerId: run.careerId,
        userId: run.userId,
      }),
    );

    const [rowAfter] = await run.test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, run.careerId));

    /*
     * Loyalty is the dimension a standing arrangement is allowed to move, and
     * the one no run of good sessions could. It was near-nothing after a single
     * session and is not any more.
     */
    expect(rowBefore!.loyalty).toBeLessThan(10);
    expect(rowAfter!.loyalty - rowBefore!.loyalty).toBeGreaterThan(15);
    expect(rowAfter!.trust).toBeGreaterThan(rowBefore!.trust);

    /*
     * The line the player reads does not have to change, and here it does not.
     * Agreeing to something is not the same as instantly thinking more of
     * somebody — what changed is what LEX has committed to, and that shows up
     * as crew membership rather than as a new phrase about the relationship.
     */
    const after = (await getPeople(run.test.handle.db, run.careerId))[0]!;
    expect(after.subjectId).toBe(before.subjectId);
    expect(after.interactionCount).toBeGreaterThan(before.interactionCount);
  });

  it("will not be asked twice", async () => {
    const producer = await lex();

    const eligibility = await getCrewEligibility(run.test.ctx, {
      careerId: run.careerId,
      subjectId: producer.id,
    });

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toMatch(/already with you/i);
  });
});

/**
 * Moments.
 *
 * The first gameplay payoff, and the rule that keeps it honest: a moment is an
 * invitation to a decision, not the decision's consequence. Surfacing "LEX
 * wants to talk" must not clear the air by itself — the player has to answer,
 * and the answer is what moves anything.
 */
describe("a relationship with something to say", () => {
  let run: Run;

  beforeAll(async () => {
    run = await liveThroughASession({
      friction: true,
      stageName: "MOMENTKX",
      title: "SAID OUT LOUD",
    });
  }, 120_000);

  afterAll(async () => {
    await run.close();
  });

  it("surfaced while time was passing, not when somebody looked", async () => {
    /*
     * Nothing in this test asks the world to decide anything. The moment is
     * already there, because the days advancing is what created it — opening a
     * screen must never be what makes LEX want to talk.
     */
    const open = await getOpenMoments(run.test.ctx, run.careerId);
    expect(open).toHaveLength(1);

    const [moment] = await getMomentHistory(run.test.ctx, run.careerId);

    /*
     * The friction career respects LEX and has something unresolved with him.
     * The same tension with *low* respect would have surfaced GONE_QUIET
     * instead — which is why the condition is a pair and not a threshold.
     */
    expect(moment!.kind).toBe("WANTS_TO_TALK");
    expect(moment!.status).toBe("OPEN");
    expect(moment!.triggerReason).toMatch(/respect .* and tension /);

    // The state that caused it is kept, not recomputed later.
    expect(moment!.triggerState.tension).toBeGreaterThan(0);
    expect(moment!.triggerState.respect).toBeGreaterThan(0);
  });

  it("does not surface anything before a day has passed", async () => {
    // A separate career that has released but not yet let a day go by.
    const fresh = await createTestContext();
    const user = await createTestUser(fresh, "NOTYET");
    await makePublishedRelease(fresh, user, "TOO SOON", {
      stageName: "NOTYET",
      friction: true,
    });

    const [career] = await fresh.handle.db.select().from(careers);
    unwrap(
      await syncCareerRelationships(fresh.ctx, { careerId: career!.id, userId: user.id }),
    );

    // The relationship exists — they made a record together — but the world has
    // not had a day in which to react to any of it.
    const people = await getPeople(fresh.handle.db, career!.id);
    expect(people).toHaveLength(1);
    expect(await getOpenMoments(fresh.ctx, career!.id)).toHaveLength(0);

    await fresh.close();
  }, 120_000);

  it("changes nothing by existing", async () => {
    const [before] = await run.test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, run.careerId));

    // Surfacing already happened above; fold anything it might have written.
    unwrap(
      await syncCareerRelationships(run.test.ctx, {
        careerId: run.careerId,
        userId: run.userId,
      }),
    );

    const [after] = await run.test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, run.careerId));

    // An invitation is not a consequence. LEX wanting to talk has not, by
    // itself, cleared the air.
    expect(after!.tension).toBe(before!.tension);
    expect(after!.trust).toBe(before!.trust);
    expect(after!.respect).toBe(before!.respect);
  });

  it("does not reroll when you look again", async () => {
    const first = await getOpenMoments(run.test.ctx, run.careerId);

    // Three more passes, as a page load would do.
    for (let pass = 0; pass < 3; pass += 1) {
      unwrap(
        await surfaceRelationshipMoments(run.test.ctx, {
          careerId: run.careerId,
          userId: run.userId,
        }),
      );
    }

    const again = await getOpenMoments(run.test.ctx, run.careerId);

    expect(again).toHaveLength(1);
    expect(again[0]!.id).toBe(first[0]!.id);
    expect(again[0]!.title).toBe("LEX wants to talk.");
  });

  it("offers real choices, in words", async () => {
    const [moment] = await getOpenMoments(run.test.ctx, run.careerId);

    expect(moment!.options.length).toBeGreaterThan(1);
    expect(moment!.options.map((option) => option.response)).toContain("TALK");
    expect(moment!.options.map((option) => option.response)).toContain("IGNORE");
    expect(JSON.stringify(moment!.options)).not.toMatch(/[0-9]/);
  });

  it("refuses an answer the moment never offered", async () => {
    const [moment] = await getOpenMoments(run.test.ctx, run.careerId);

    const result = await respondToMoment(run.test.ctx, {
      careerId: run.careerId,
      userId: run.userId,
      momentId: moment!.id,
      response: "ACCEPT",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/isn't one of your options/i);
  });

  it("puts the consequence in the answer, and prices it through the fold", async () => {
    const [moment] = await getOpenMoments(run.test.ctx, run.careerId);
    const [before] = await run.test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, run.careerId));

    const answered = unwrap(
      await respondToMoment(run.test.ctx, {
        careerId: run.careerId,
        userId: run.userId,
        momentId: moment!.id,
        response: "TALK",
      }),
    );

    expect(answered.moment.status).toBe("RESOLVED");
    expect(answered.moment.response).toBe("TALK");
    expect(answered.interaction).toBe("TALKED_IT_THROUGH");

    // Still nothing has moved: the command records, the fold prices.
    const [midway] = await run.test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, run.careerId));
    expect(midway!.tension).toBe(before!.tension);

    unwrap(
      await syncCareerRelationships(run.test.ctx, {
        careerId: run.careerId,
        userId: run.userId,
      }),
    );

    const [after] = await run.test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, run.careerId));

    // Hearing somebody out is the thing that actually clears the air.
    expect(after!.tension).toBeLessThan(before!.tension);
    expect(after!.trust).toBeGreaterThan(before!.trust);
  });

  it("closes the moment for good", async () => {
    const open = await getOpenMoments(run.test.ctx, run.careerId);
    expect(open).toHaveLength(0);

    const history = await getMomentHistory(run.test.ctx, run.careerId);
    expect(history).toHaveLength(1);
    expect(history[0]!.status).toBe("RESOLVED");
    expect(history[0]!.resolvedAtGameTime).toBeTruthy();
  });
});
