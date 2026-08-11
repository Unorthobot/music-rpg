import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { characters, eq, gameEvents, relationships, type UserRow } from "@music-rpg/database";
import { GameEventType } from "@music-rpg/events";
import {
  advanceCareerDay,
  getPeople,
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
