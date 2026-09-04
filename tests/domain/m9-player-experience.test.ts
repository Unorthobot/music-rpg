import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  careerProgressionObservations,
  careers,
  gameEvents,
  tracks,
  eq,
  type CareerRow,
} from "@music-rpg/database";
import {
  advanceCareerDay,
  getCareerChapter,
  getCareerHome,
  getCatalogue,
  getNotifications,
} from "@music-rpg/domain";
import { listPublicCareerEvents } from "@music-rpg/events";
import {
  CHAPTER_LABELS,
  CHAPTER_LINES,
  COME_UP_PLAYER_LINE,
  COME_UP_WORLD_LINE,
} from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { liveGolden, type GoldenMode } from "../helpers/progression";

/**
 * M9, as the player experiences it.
 *
 * The closeout proof established that the transition happens, happens once, and
 * rewrites nothing. This asks the product question that outranks all of it:
 *
 * > When the world changes how it relates to a career, does the player find
 * > out — and do they find out *only* the things the world actually decided?
 *
 * Both halves are load-bearing. A career that comes up in silence has not come
 * up as far as the person playing is concerned. A career that comes up and is
 * handed three domain names and a blocker has been shown the machine.
 *
 * Every career here is lived through real commands. Nothing sets `career_act`
 * directly, because a screen proved correct against a hand-written row is
 * proved against a world that cannot occur.
 */

let T: TestContext;
beforeAll(async () => {
  T = await createTestContext();
}, 120_000);
afterAll(async () => {
  await T?.close();
});

const rowOf = async (careerId: string): Promise<CareerRow> =>
  (await T.handle.db.select().from(careers).where(eq(careers.id, careerId)))[0]!;

/** The transition event, read straight from the log rather than through a cap. */
const transitionEvent = async (careerId: string) =>
  (await T.handle.db.select().from(gameEvents).where(eq(gameEvents.careerId, careerId))).filter(
    (event) => event.eventType === "career.entered_come_up",
  );

/**
 * The public feed, filtered exactly as `/world` filters it.
 *
 * Not through `listCareerEvents`, which caps at twenty — a career with weeks of
 * reception has thousands of events, and the cap would hide the fact under test.
 */
const publicFeedFor = async (careerId: string) =>
  (await T.handle.db.select().from(gameEvents).where(eq(gameEvents.careerId, careerId))).filter(
    (event) =>
      event.visibility === "LOCAL_PUBLIC" || event.visibility === "GLOBAL_PUBLIC",
  );

/**
 * Vocabulary that must never reach a player.
 *
 * Domains qualify and descriptors explain, and neither is the player's business.
 * The failure this guards against is not somebody printing `satisfiedDomains` on
 * Home — it is the slow leak, where a line of copy starts describing the
 * evaluator because the evaluator was the thing in front of whoever wrote it.
 */
const FORBIDDEN = [
  "RECEPTION",
  "PEER",
  "PUBLIC_RECORD",
  "domain",
  "descriptor",
  "evidence",
  "blocker",
  "blocked",
  "qualif",
  "threshold",
  "evaluator",
  "criteria",
  "requirement",
  "unlock",
  "progress toward",
  "% ",
];

const leaks = (text: string): string[] =>
  FORBIDDEN.filter((term) => text.toLowerCase().includes(term.toLowerCase()));

/**
 * A window wide enough to hold a whole career's notified history.
 *
 * `getNotifications` is a **feed**: recency-ordered, capped, and derived on
 * every read. These histories live forty in-world days in which the director
 * offers something almost daily and the career declines it, so a career reaches
 * day forty carrying north of a hundred `opportunity.created` events — and the
 * transition, which happened once weeks earlier, is a hundred rows down.
 *
 * Asking for twenty and finding offers would prove only that offers are newer
 * than the transition, which they are and should be. The claim under test is
 * that the event **is in the projection and is in it once**, so it is asked of a
 * window that spans the history rather than of the first screenful.
 *
 * That the player is told *at the time it happens* is a different claim, and a
 * more important one. It is asserted separately, through the default window, on
 * the day — see section 8.
 */
const WHOLE_HISTORY = 500;

/* --- Shared histories ----------------------------------------------------- */

type Lived = { careerId: string; transitionDay: number | null; userId: string };

const lived = new Map<GoldenMode, Lived>();

/**
 * Each history lived once and shared by every assertion about it.
 *
 * Forty in-world days of real commands per mode is the expensive part of this
 * file, and re-living A four times to ask four questions about it would buy
 * nothing — the run is deterministic under a fixed seed, so the second run is
 * the first run again.
 */
async function history(mode: GoldenMode): Promise<Lived> {
  const cached = lived.get(mode);
  if (cached) return cached;

  const user = await createTestUser(T, `M9 UX ${mode}`);
  const run = await liveGolden(T, user, mode, mode === "C" ? 45 : 40);
  const entry = { careerId: run.careerId, transitionDay: run.transitionDay, userId: user.id };
  lived.set(mode, entry);
  return entry;
}

/* --- 1 · the four journeys that arrive ------------------------------------ */

describe("1 · a career that comes up is told, on every surface that should say so", () => {
  for (const mode of ["A", "B", "C", "D"] as const) {
    it(`${mode} · Home, Career, World and Notifications all reflect the same transition`, async () => {
      const { careerId } = await history(mode);
      const career = await rowOf(careerId);
      expect(career.careerAct, "this history was supposed to transition").toBe("COME_UP");

      const events = await transitionEvent(careerId);
      expect(events).toHaveLength(1);
      const occurredAt = events[0]!.occurredAt;

      /* Career: the chapter, named, with the day it began. */
      const chapter = await getCareerChapter(T.handle.db, career);
      expect(chapter.label).toBe(CHAPTER_LABELS.COME_UP);
      expect(chapter.line).toBe(CHAPTER_LINES.COME_UP);
      expect(chapter.beganOn).toEqual(occurredAt);

      /* Home: the same chapter, from the same function. */
      const home = await getCareerHome(T.handle.db, career);
      expect(home.chapter).toEqual(chapter);

      /* Notifications: told once, in the player's register. */
      const notifications = await getNotifications(T.handle.db, career, WHOLE_HISTORY);
      const told = notifications.filter((entry) => entry.line === COME_UP_PLAYER_LINE);
      expect(told, "the player was never told").toHaveLength(1);
      expect(told[0]!.href).toBe("/career");
      expect(told[0]!.occurredAt).toEqual(occurredAt);

      /* World: the scene saw it, in the public feed it already had. */
      const feed = await publicFeedFor(careerId);
      expect(feed.some((event) => event.eventType === "career.entered_come_up")).toBe(true);
    }, 300_000);
  }
});

/* --- 2 · the absences that must hold -------------------------------------- */

/**
 * The two histories that must stay quiet.
 *
 * E released work that never landed. F released work that landed and did nothing
 * else, forever, at any magnitude. Neither qualifies, and the correct
 * player-facing consequence of not qualifying is **nothing at all** — not a
 * locked chapter, not a partial one, not an explanation of what is missing.
 *
 * This is the harder half of M9. Shipping the arrival is easy; shipping the
 * absence is what stops the game becoming a checklist, because a player who is
 * told what they are missing will go and farm it.
 */
describe("2 · a career that has not come up is told nothing", () => {
  for (const mode of ["E", "F"] as const) {
    it(`${mode} · stays in The Underground with no notification and no public fact`, async () => {
      const { careerId } = await history(mode);
      const career = await rowOf(careerId);
      expect(career.careerAct).toBe("UNDERGROUND");

      expect(await transitionEvent(careerId), "a transition was written").toHaveLength(0);

      const chapter = await getCareerChapter(T.handle.db, career);
      expect(chapter.label).toBe(CHAPTER_LABELS.UNDERGROUND);
      expect(chapter.line).toBe(CHAPTER_LINES.UNDERGROUND);
      /* No date, because nothing began — never the career's start date instead. */
      expect(chapter.beganOn).toBeNull();
      expect(chapter.beganToday).toBe(false);

      const home = await getCareerHome(T.handle.db, career);
      expect(home.chapter).toEqual(chapter);
      expect(home.chapter.beganToday, "Home showed a transition treatment").toBe(false);

      const notifications = await getNotifications(T.handle.db, career, 50);
      expect(notifications.some((entry) => entry.line === COME_UP_PLAYER_LINE)).toBe(false);
      expect(notifications.some((entry) => entry.href === "/career")).toBe(false);

      const feed = await publicFeedFor(careerId);
      expect(feed.some((event) => event.eventType === "career.entered_come_up")).toBe(false);
      /* But the career is not invisible — its records still reached the world. */
      expect(feed.some((event) => event.eventType === "release.published")).toBe(true);
    }, 300_000);
  }

  /**
   * The anti-grind proof, at the interface.
   *
   * F is the runaway record: enormous reception and nothing else. Nowhere in
   * what F's player can see is there a hint that a second kind of recognition is
   * the thing missing — because the moment that hint exists, the correct way to
   * play becomes farming it.
   */
  it("F · never names what is missing, anywhere a player can see", async () => {
    const { careerId } = await history("F");
    const career = await rowOf(careerId);

    const chapter = await getCareerChapter(T.handle.db, career);
    const home = await getCareerHome(T.handle.db, career);
    const notifications = await getNotifications(T.handle.db, career, 50);

    const playerFacing = [
      chapter.label,
      chapter.line,
      home.rightNow.title,
      home.rightNow.detail,
      home.rightNow.cta,
      ...home.story.flatMap((card) => [card.eyebrow, card.title, card.detail]),
      ...notifications.map((entry) => entry.line),
    ].join("\n");

    expect(leaks(playerFacing), "the evaluator reached the player").toEqual([]);
  }, 300_000);
});

/* --- 3 · one fact, one source --------------------------------------------- */

describe("3 · cross-surface causality", () => {
  /**
   * The regression this exists for: two screens growing their own idea of the
   * same date. Home and Career must not merely agree today — they must be
   * *unable* to disagree, which is what one shared function buys.
   */
  /**
   * The World feed can actually reach it.
   *
   * Read through `listPublicCareerEvents` at the size `/world` asks for, rather
   * than by scanning the log — because the defect this exists for was invisible
   * to a scan. The page used to read the twenty *oldest* events of a career's
   * life and filter those to the public ones, so its feed was fixed at
   * onboarding; with reception writing hundreds of private events a week, no
   * public event could reach the window and the transition never appeared.
   *
   * A forty-day career is the point: the transition is thousands of rows deep,
   * and only a query that filters before it limits can find it.
   */
  it("reaches the World feed at the size the page asks for", async () => {
    const { transitionDay } = await history("D");
    expect(transitionDay).not.toBeNull();

    /*
     * A career stopped on the day it came up, read at the page's own size.
     *
     * The defect this exists for was invisible to a scan of the log: `/world`
     * used to read the twenty *oldest* events of a career's life and filter
     * those down to the public ones, so its feed was fixed at whatever happened
     * during onboarding. Once reception began writing hundreds of private
     * events a week, that window could not contain a public event at all, and
     * the scene never saw the act change on the day it changed.
     *
     * Asked on the day, because that is the claim: a month later the feed is
     * full of newer public facts and the transition has scrolled off it, which
     * is a feed working. Career keeps the chapter and its date for good.
     */
    const user = await createTestUser(T, "Scene saw it");
    const run = await liveGolden(T, user, "D", transitionDay!);
    expect(run.transitionDay).toBe(transitionDay);

    const feed = await listPublicCareerEvents(T.handle.db, run.careerId, 20);

    expect(
      feed.some((event) => event.eventType === "career.entered_come_up"),
      "the scene never saw it",
    ).toBe(true);

    /* Newest first, which is the order the feed renders in. */
    const sequences = feed.map((event) => Number(event.sequence));
    expect(sequences).toEqual([...sequences].sort((a, b) => b - a));

    /* And a career's private business is not in the scene's feed. */
    expect(feed.every((event) => event.visibility.endsWith("PUBLIC"))).toBe(true);
  }, 300_000);

  it("gives Home and Career the same chapter, byte for byte", async () => {
    const { careerId } = await history("B");
    const career = await rowOf(careerId);

    const direct = await getCareerChapter(T.handle.db, career);
    const viaHome = (await getCareerHome(T.handle.db, career)).chapter;

    expect(viaHome).toEqual(direct);
    expect(viaHome.beganOn).toEqual(direct.beganOn);
  }, 300_000);

  /**
   * The chapter began when the act changed, not when the evidence did.
   *
   * `domain_first_reached` records when each kind of recognition first appeared,
   * and a career can hold one domain for weeks before a second arrives. Reading
   * the chapter's start from the earliest of those would date The Come Up to a
   * day when the career was unambiguously still in The Underground.
   */
  it("dates the chapter from the transition event, never from first-reached", async () => {
    const { careerId } = await history("B");
    const career = await rowOf(careerId);

    const chapter = await getCareerChapter(T.handle.db, career);
    const events = await transitionEvent(careerId);
    expect(chapter.beganOn).toEqual(events[0]!.occurredAt);

    const observation = (
      await T.handle.db
        .select()
        .from(careerProgressionObservations)
        .where(eq(careerProgressionObservations.careerId, careerId))
    )[0]!;

    const firstReached = [
      observation.receptionFirstReachedGameTime,
      observation.peerFirstReachedGameTime,
      observation.publicRecordFirstReachedGameTime,
    ]
      .filter((value): value is Date => value !== null)
      .map((value) => value.getTime());

    expect(firstReached.length, "this history should have reached domains").toBeGreaterThan(0);

    /*
     * The transition cannot precede the evidence that caused it, and the
     * earliest domain is the one the chapter must NOT be dated from. Where they
     * fall on the same day that is a fact about this history rather than a
     * shortcut being taken — the assertion above already pinned the source.
     */
    expect(chapter.beganOn!.getTime()).toBeGreaterThanOrEqual(Math.min(...firstReached));
  }, 300_000);
});

/* --- 4 · the day-of treatment is the world's, not the player's ------------- */

describe("4 · Home's day-of treatment", () => {
  /**
   * It appears because it is that day and disappears because it stopped being
   * that day. No `seen_at`, no dismissal, no consumption — so looking at Home
   * cannot end it, and not looking cannot preserve it.
   */
  it("is true on the day, false the next, and unaffected by being read", async () => {
    const user = await createTestUser(T, "Day Of");
    const run = await liveGolden(T, user, "B");
    expect(run.transitionDay).not.toBeNull();

    const career = await rowOf(run.careerId);
    const events = await transitionEvent(run.careerId);

    /*
     * Whether the shared history happens to be sitting on its transition day
     * depends on how many days it ran afterwards, so the invariant is asserted
     * as the definition rather than as a hoped-for value: the treatment is
     * showing exactly when the event's date is the career's current date.
     */
    const sameDay =
      events[0]!.occurredAt.toISOString().slice(0, 10) ===
      career.currentGameDate.toISOString().slice(0, 10);

    const chapter = await getCareerChapter(T.handle.db, career);
    expect(chapter.beganToday).toBe(sameDay);

    /* Reading it four times gives the same answer four times. */
    for (let i = 0; i < 4; i += 1) {
      const again = await getCareerHome(T.handle.db, career);
      expect(again.chapter.beganToday).toBe(sameDay);
    }

    /* And letting a day pass is the only thing that ends it. */
    await advanceCareerDay(T.ctx, {
      careerId: run.careerId,
      userId: user.id,
      seed: "golden",
    });
    const after = await getCareerChapter(T.handle.db, await rowOf(run.careerId));
    expect(after.beganToday).toBe(false);
    /* The date itself does not move. */
    expect(after.beganOn).toEqual(events[0]!.occurredAt);
  }, 300_000);
});

/* --- 5 · reading changes nothing ------------------------------------------ */

describe("5 · read-only invariance", () => {
  /**
   * Time creates, screens reveal.
   *
   * Home is the screen with the most reason to cheat — it has a command context
   * within reach and the most state to want fresh. If any player surface could
   * advance a career, this is where it would happen.
   */
  it("leaves the career, the observation and the log identical", async () => {
    const { careerId } = await history("B");
    const career = await rowOf(careerId);

    const snapshot = async () => ({
      career: await rowOf(careerId),
      observation: (
        await T.handle.db
          .select()
          .from(careerProgressionObservations)
          .where(eq(careerProgressionObservations.careerId, careerId))
      )[0],
      events: (
        await T.handle.db.select().from(gameEvents).where(eq(gameEvents.careerId, careerId))
      ).length,
    });

    const before = await snapshot();

    await getCareerHome(T.handle.db, career);
    await getCareerChapter(T.handle.db, career);
    await getNotifications(T.handle.db, career, 50);
    await getCatalogue(T.handle.db, career);
    await getCareerHome(T.handle.db, career);

    expect(await snapshot()).toEqual(before);
  }, 300_000);
});

/* --- 6 · Projects tells the truth about what opened ----------------------- */

describe("6 · Projects after the act changes", () => {
  /**
   * The screen partitions on availability, which is the question its two
   * headings ask.
   *
   * Splitting on track count was indistinguishable from this while nobody could
   * leave The Underground — every multi-track format was act-locked for every
   * career, so "Not yet" was accurate by accident. The first career to come up
   * with four tracks would have found its EP under **Not yet** carrying a tag
   * reading **Open**.
   */
  it("puts every open format on the open side, and every locked one with its reason", async () => {
    const { careerId } = await history("B");
    const career = await rowOf(careerId);
    expect(career.careerAct).toBe("COME_UP");

    const catalogue = await getCatalogue(T.handle.db, career);
    const open = catalogue.formats.filter((format) => format.available);
    const locked = catalogue.formats.filter((format) => !format.available);

    /* The partition is total and the two sides are exactly the two headings. */
    expect(open.length + locked.length).toBe(catalogue.formats.length);
    for (const format of open) expect(format.lockedReason).toBeNull();
    for (const format of locked) expect(format.lockedReason).not.toBeNull();

    /*
     * Nothing on this screen is still locked *for the act*, because the act
     * changed. Anything still shut is shut for the catalogue, which is a reason
     * the player can act on.
     */
    for (const format of locked) {
      expect(
        format.lockedReason,
        `${format.format} is still act-locked after coming up`,
      ).not.toBe("Not at this stage of your career.");
    }

    const size = (await T.handle.db.select().from(tracks).where(eq(tracks.careerId, careerId)))
      .length;
    const ep = catalogue.formats.find((format) => format.format === "EP")!;
    expect(ep.available).toBe(size >= ep.minimumTracks);
  }, 300_000);

  it("keeps an Underground career's act-locked formats locked, and says so", async () => {
    const { careerId } = await history("F");
    const career = await rowOf(careerId);
    expect(career.careerAct).toBe("UNDERGROUND");

    const catalogue = await getCatalogue(T.handle.db, career);
    const ep = catalogue.formats.find((format) => format.format === "EP")!;
    expect(ep.available).toBe(false);
    expect(ep.lockedReason).toBe("Not at this stage of your career.");
    /*
     * And the reason names the stage rather than what would end it. "Not at this
     * stage of your career" is a fact; "comes at The Come Up" would be a route.
     */
    expect(leaks(ep.lockedReason!)).toEqual([]);
  }, 300_000);
});

/* --- 7 · the boundary is a type, not a habit ------------------------------ */

describe("7 · what the player-facing modules can express", () => {
  /**
   * Asserted against the module's **exports**, not its source text.
   *
   * Grepping the file for "domain" matches the prose explaining why domains are
   * absent, which is exactly backwards: the comment doing the explaining would
   * fail the test that the explanation exists to justify.
   */
  it("exposes no domain, descriptor, blocker or evaluator vocabulary", async () => {
    /*
     * The chapter module itself, not the barrel it is re-exported through.
     *
     * Asked of `@music-rpg/shared` by name prefix, this test failed on
     * `COME_UP_REQUIRED_DOMAINS` and `COME_UP_REQUIRES_NON_RECEPTION` — which
     * are the evaluator's thresholds, live in `progression.ts`, and are reached
     * by nothing player-facing. The prefix is all they share.
     *
     * That collision is worth stating rather than filtering away: the barrel
     * every screen imports does carry the thresholds, so **package membership is
     * not the boundary here**. The boundary is `ChapterView`, which is a shape
     * with no domain, count or blocker on it, so a screen holding one cannot ask
     * the question — see the type's own note. What this asserts is the narrower
     * thing it can honestly assert: the module that exists to be player-facing
     * exports four names, and all four are copy.
     */
    const chapterModule = await import("../../packages/shared/src/chapter-view");

    expect(Object.keys(chapterModule).sort()).toEqual([
      "CHAPTER_LABELS",
      "CHAPTER_LINES",
      "COME_UP_PLAYER_LINE",
      "COME_UP_WORLD_LINE",
    ]);

    /* Every word of chapter copy, checked as copy. */
    const copy = [
      ...Object.values(CHAPTER_LABELS),
      ...Object.values(CHAPTER_LINES),
      COME_UP_PLAYER_LINE,
      COME_UP_WORLD_LINE,
    ].join("\n");

    expect(leaks(copy)).toEqual([]);
  });

  /**
   * The chapter is answerable without the evaluator.
   *
   * A screen that could ask "why has this career not come up" would eventually
   * be given an answer. `getCareerChapter` reads two things — the act and the
   * transition event — and importing `decidePhase` here would be the first step
   * toward a Home that evaluates a career in order to render it.
   */
  it("answers the chapter without touching the evaluator", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("packages/domain/src/queries/chapter.ts", "utf8");

    /*
     * Asserted against the import statements, not the file text.
     *
     * The prose in that module explains that it does not call `decidePhase` —
     * so a grep for `decidePhase` matches the sentence promising it is absent,
     * and the comment justifying the boundary would be the thing that failed
     * the test. What actually matters is reachability: nothing can be called
     * that was never brought in.
     */
    const imports = [...source.matchAll(/import[\s\S]*?from\s+"[^"]+";/g)]
      .map((match) => match[0])
      .join("\n");

    expect(imports).not.toMatch(/@music-rpg\/simulation/);
    expect(imports).not.toMatch(/decidePhase|evaluateEvidence|loadEvidenceFacts/);
    expect(imports).not.toMatch(/careerProgressionObservations/);

    /* And the query reads the two tables it is allowed to read. */
    expect(imports).toMatch(/gameEvents/);
  });

  /**
   * World keeps two registers, and does not collapse them into one.
   *
   * `gameEventLabels` stays mechanical for World Control — an operator debugging
   * a transition needs "Career entered The Come Up" — while the player-facing
   * feed says what the scene saw.
   */
  it("leaves the inspector's label table alone", async () => {
    const { gameEventLabels } = await import("@music-rpg/events");
    expect(gameEventLabels["career.entered_come_up"]).toBe("Career entered The Come Up");
    expect(COME_UP_WORLD_LINE).not.toBe(gameEventLabels["career.entered_come_up"]);
    /* And the player's line makes no claim about a population. */
    expect(COME_UP_WORLD_LINE.toLowerCase()).not.toMatch(/people|everyone|fans|listeners/);
  });
});

/* --- 8 · told once, because it happened once ------------------------------ */

describe("8 · notification eligibility", () => {
  /**
   * Exactly-once with no read-state, no consumption and no second event.
   *
   * The list is derived from the log on every read, so "already shown" is not a
   * thing it could know. What makes it appear once is that the underlying event
   * exists once — the act update is gated on the row still reading
   * `UNDERGROUND` inside the same transaction that writes the event.
   */
  /**
   * The claim the milestone actually rests on: **told, at the time, without
   * having to go looking.**
   *
   * Read through the *default* window — the one the screen uses — on the day the
   * act changed, because that is the only day the player could have been told
   * rather than have discovered it. Weeks later the feed is full of newer
   * offers and the transition has scrolled away, which is a feed working, not a
   * fact being lost: Career keeps the chapter and its date forever.
   *
   * It leads that day by construction rather than by ranking. `advanceCareerDay`
   * evaluates progression last, after the day is fully written, so the
   * transition carries the highest sequence of every event that day — including
   * the offers the same advance created. Nothing sorts it to the top; it is
   * simply the last thing that happened.
   */
  it("leads the feed on the day, through the window the screen uses", async () => {
    const { transitionDay } = await history("B");
    expect(transitionDay, "B was supposed to transition").not.toBeNull();

    /*
     * A second B, lived only as far as the day it comes up. The run is
     * deterministic under the same seed, so this is the same history stopped
     * early rather than a different one.
     */
    const user = await createTestUser(T, "Day of");
    const run = await liveGolden(T, user, "B", transitionDay!);
    expect(run.transitionDay).toBe(transitionDay);

    const career = await rowOf(run.careerId);
    const notifications = await getNotifications(T.handle.db, career);

    expect(notifications[0]?.line, "the transition was not the news that day").toBe(
      COME_UP_PLAYER_LINE,
    );
    expect(notifications[0]?.href).toBe("/career");
  }, 300_000);

  it("lists the transition once, and still once after ten more days", async () => {
    const user = await createTestUser(T, "Once");
    const run = await liveGolden(T, user, "B");
    expect(run.transitionDay).not.toBeNull();

    const countTold = async () => {
      const career = await rowOf(run.careerId);
      const notifications = await getNotifications(T.handle.db, career, WHOLE_HISTORY);
      return notifications.filter((entry) => entry.line === COME_UP_PLAYER_LINE).length;
    };

    expect(await countTold()).toBe(1);

    /* Reading it repeatedly must not consume it. */
    expect(await countTold()).toBe(1);
    expect(await countTold()).toBe(1);

    for (let day = 0; day < 10; day += 1) {
      await advanceCareerDay(T.ctx, {
        careerId: run.careerId,
        userId: user.id,
        seed: "golden",
      });
    }

    expect(await countTold(), "the transition was announced twice").toBe(1);
    expect(await transitionEvent(run.careerId)).toHaveLength(1);
  }, 300_000);

  /**
   * A notification is a pointer, never a second copy of the fact.
   *
   * Deleting every notification must cost the player nothing: the chapter is on
   * Career, the fact is in the log, and the act is on the career row.
   */
  it("points at state that survives without it", async () => {
    const { careerId } = await history("B");
    const career = await rowOf(careerId);

    const notifications = await getNotifications(T.handle.db, career, WHOLE_HISTORY);
    const told = notifications.find((entry) => entry.line === COME_UP_PLAYER_LINE)!;

    expect(told.href).toBe("/career");
    expect((await getCareerChapter(T.handle.db, career)).label).toBe(CHAPTER_LABELS.COME_UP);
    expect(career.careerAct).toBe("COME_UP");
  }, 300_000);
});
