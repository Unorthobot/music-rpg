import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { artists, eq, groupMemberships, groups, type UserRow } from "@music-rpg/database";
import { GameEventType, listCareerEvents } from "@music-rpg/events";
import {
  addGroupMember,
  completeCareerOnboarding,
  completeGroupLineup,
  completeSoundDiscovery,
  createCareer,
  createGroup,
  getCandidateViews,
  getCareerView,
  loadDiscoveryQuestions,
  saveDiscoveryAnswer,
  selectCareerType,
} from "@music-rpg/domain";
import { unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";

const GROUP_ANSWERS: Record<string, string> = {
  q_aux: "move",
  q_matters: "hook",
  q_challenged: "hit",
  q_environment: "rehearsal",
  q_group_decisions: "vote",
  q_group_edge: "stage",
  q_statement_group: "move before they think about it",
};

describe("group career", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;
  let groupId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");

    const career = unwrap(await createCareer(test.ctx, { userId: user.id }));
    careerId = career.career.id;
    unwrap(await selectCareerType(test.ctx, { careerId, userId: user.id, careerType: "GROUP" }));
  });

  afterAll(async () => {
    await test.close();
  });

  it("creates the group as the controlled entity", async () => {
    const result = unwrap(
      await createGroup(test.ctx, {
        careerId,
        userId: user.id,
        name: "THE LONG WAY",
        creativeDirection: "Live drums, no quantising.",
      }),
    );

    groupId = result.group.id;

    expect(result.group.slug).toBe("the-long-way");
    expect(result.group.status).toBe("FORMING");
    expect(result.career.controlledEntityType).toBe("GROUP");
    expect(result.career.controlledEntityId).toBe(groupId);
    expect(result.career.onboardingState).toBe("SOUND_DISCOVERY");
  });

  it("asks group-specific discovery questions", async () => {
    const questions = await loadDiscoveryQuestions(test.handle.db, "GROUP");
    const ids = questions.map((question) => question.id);

    expect(ids).toContain("q_group_decisions");
    expect(ids).toContain("q_statement_group");
    // Solo-only questions must not appear.
    expect(ids).not.toContain("q_statement");
  });

  it("derives group sound DNA and routes to member selection", async () => {
    const questions = await loadDiscoveryQuestions(test.handle.db, "GROUP");

    for (const question of questions) {
      const answer = GROUP_ANSWERS[question.id];
      if (!answer) continue;
      unwrap(
        await saveDiscoveryAnswer(test.ctx, {
          careerId,
          userId: user.id,
          questionId: question.id,
          value: answer,
        }),
      );
    }

    const { identity } = unwrap(await completeSoundDiscovery(test.ctx, { careerId, userId: user.id }));
    const view = (await getCareerView(test.handle.db, careerId))!;

    expect(view.entity?.type).toBe("GROUP");
    expect(view.entity?.soundSummary).toBe(identity.soundSummary);
    expect(view.career.onboardingState).toBe("MEMBERS");
  });

  it("shows candidates qualitatively, never as raw numbers", async () => {
    const view = (await getCareerView(test.handle.db, careerId))!;
    const candidates = await getCandidateViews(test.handle.db, view.world.id, groupId);

    expect(candidates.length).toBeGreaterThan(0);

    for (const candidate of candidates) {
      expect(candidate.role).toBeTruthy();
      expect(candidate.strength).not.toMatch(/\d/);
      expect(candidate.personality).not.toMatch(/\d/);
      expect(candidate.tendency).not.toMatch(/\d/);
    }
  });

  it("adds members as real artists and recomputes chemistry", async () => {
    const view = (await getCareerView(test.handle.db, careerId))!;
    const candidates = await getCandidateViews(test.handle.db, view.world.id, groupId);

    const first = candidates[0]!.artist;
    const second = candidates[1]!.artist;

    const afterFirst = unwrap(
      await addGroupMember(test.ctx, { careerId, userId: user.id, artistId: first.id }),
    );
    expect(afterFirst.members).toHaveLength(1);
    expect(afterFirst.members[0]!.membership.isFounder).toBe(true);

    const afterSecond = unwrap(
      await addGroupMember(test.ctx, { careerId, userId: user.id, artistId: second.id }),
    );
    expect(afterSecond.members).toHaveLength(2);
    expect(afterSecond.chemistry.score).toBeGreaterThanOrEqual(0);
    expect(afterSecond.chemistry.summary).toBeTruthy();

    const [artistRow] = await test.handle.db.select().from(artists).where(eq(artists.id, first.id));
    expect(artistRow?.currentGroupId).toBe(groupId);
  });

  it("does not add the same member twice", async () => {
    const view = (await getCareerView(test.handle.db, careerId))!;
    const candidates = await getCandidateViews(test.handle.db, view.world.id, groupId);
    const first = candidates.find((candidate) => candidate.membership)!.artist;

    const result = unwrap(
      await addGroupMember(test.ctx, { careerId, userId: user.id, artistId: first.id }),
    );

    expect(result.members).toHaveLength(2);

    const rows = await test.handle.db
      .select()
      .from(groupMemberships)
      .where(eq(groupMemberships.groupId, groupId));
    expect(rows).toHaveLength(2);
  });

  it("refuses a member who already belongs to another group", async () => {
    const otherUser = await createTestUser(test, "Rival");
    const otherCareer = unwrap(await createCareer(test.ctx, { userId: otherUser.id }));
    unwrap(
      await selectCareerType(test.ctx, {
        careerId: otherCareer.career.id,
        userId: otherUser.id,
        careerType: "GROUP",
      }),
    );
    unwrap(
      await createGroup(test.ctx, {
        careerId: otherCareer.career.id,
        userId: otherUser.id,
        name: "SECOND WIND",
      }),
    );

    const taken = (
      await test.handle.db
        .select()
        .from(groupMemberships)
        .where(eq(groupMemberships.groupId, groupId))
    )[0]!;

    const result = await addGroupMember(test.ctx, {
      careerId: otherCareer.career.id,
      userId: otherUser.id,
      artistId: taken.artistId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MEMBER_UNAVAILABLE");
  });

  it("locks the line-up and enters the underground", async () => {
    unwrap(await completeGroupLineup(test.ctx, { careerId, userId: user.id }));

    const career = unwrap(await completeCareerOnboarding(test.ctx, { careerId, userId: user.id }));
    expect(career.status).toBe("ACTIVE");
    expect(career.careerAct).toBe("UNDERGROUND");

    const [group] = await test.handle.db.select().from(groups).where(eq(groups.id, groupId));
    expect(group?.status).toBe("ACTIVE");

    const events = await listCareerEvents(test.handle.db, careerId);
    const types = events.map((event) => event.eventType);

    expect(types).toContain(GameEventType.GroupCreated);
    expect(types).toContain(GameEventType.GroupIdentityEstablished);
    expect(types).toContain(GameEventType.GroupMemberAdded);
    expect(types).toContain(GameEventType.ControlledEntityAssigned);
    expect(types).toContain(GameEventType.CareerEnteredUnderground);

    expect(types.filter((type) => type === GameEventType.GroupMemberAdded)).toHaveLength(2);
  });

  it("keeps group membership distinct from wider crew", async () => {
    const view = (await getCareerView(test.handle.db, careerId))!;

    expect(view.entity?.type).toBe("GROUP");
    if (view.entity?.type !== "GROUP") return;

    // Members are Artists with their own identity and membership state — not a
    // generic "crew" list.
    for (const member of view.entity.members) {
      expect(member.artist.id).toBeTruthy();
      expect(member.membership.groupId).toBe(view.entity.group.id);
      expect(member.membership.commitment).toBeGreaterThan(0);
      expect(member.membership.soloAmbition).toBeGreaterThan(0);
    }
  });
});
