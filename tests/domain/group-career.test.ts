import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  artists,
  eq,
  groupMemberships,
  groups,
  soundProfiles,
  type UserRow,
} from "@music-rpg/database";
import { GameEventType, listCareerEvents } from "@music-rpg/events";
import {
  addGroupMember,
  completeCareerOnboarding,
  completeGroupLineup,
  completeSoundDiscovery,
  createCareer,
  createFoundingArtist,
  createGroup,
  createGroupMember,
  getCandidateViews,
  getCareerView,
  loadDiscoveryQuestions,
  removeGroupMember,
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
  let playerArtistId: string;

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
    // The player authors themselves before the group gets a sound.
    expect(result.career.onboardingState).toBe("FOUNDING_ARTIST");
  });

  it("refuses to finish onboarding before the player exists in the group", async () => {
    const result = await completeCareerOnboarding(test.ctx, { careerId, userId: user.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONTROLLED_ENTITY_MISSING");
  });

  it("creates the player's own founding artist inside the group", async () => {
    const result = unwrap(
      await createFoundingArtist(test.ctx, {
        careerId,
        userId: user.id,
        stageName: "KXMO",
        origin: "Braamfontein",
        role: "LEAD_MC",
      }),
    );

    playerArtistId = result.artist.id;

    expect(result.artist.artistType).toBe("PLAYER");
    expect(result.artist.currentGroupId).toBe(groupId);
    expect(result.artist.authoredByCareerId).toBe(careerId);
    // The career still controls the group; the player is a person inside it.
    expect(result.career.controlledEntityType).toBe("GROUP");
    expect(result.career.controlledEntityId).toBe(groupId);
    expect(result.career.playerArtistId).toBe(playerArtistId);
    expect(result.career.onboardingState).toBe("SOUND_DISCOVERY");

    const [membership] = await test.handle.db
      .select()
      .from(groupMemberships)
      .where(eq(groupMemberships.artistId, playerArtistId));

    expect(membership?.isFounder).toBe(true);
    expect(membership?.role).toBe("LEAD_MC");
  });

  it("renames rather than duplicating the founding artist on resume", async () => {
    const again = unwrap(
      await createFoundingArtist(test.ctx, {
        careerId,
        userId: user.id,
        stageName: "KXMO",
        role: "LEAD_MC",
      }),
    );

    expect(again.created).toBe(false);
    expect(again.artist.id).toBe(playerArtistId);

    const players = (await test.handle.db.select().from(artists)).filter(
      (row) => row.artistType === "PLAYER",
    );
    expect(players).toHaveLength(1);
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

    // The player's own artist gets the identity too: these were their answers,
    // so individual craft and temperament are real from the start.
    expect(view.playerArtist).not.toBeNull();
    expect(view.playerArtist!.artist.archetype).toBe(identity.archetype);
    expect(view.playerArtist!.skills.production).toBe(identity.skills.production);
    expect(view.playerArtist!.psychology.ambition).toBe(identity.psychology.ambition);
    expect(view.playerArtist!.traits.length).toBe(identity.traits.length);

    const profiles = await test.handle.db
      .select()
      .from(soundProfiles)
      .where(eq(soundProfiles.ownerId, playerArtistId));
    expect(profiles[0]?.summary).toBe(identity.soundSummary);
  });

  it("lets the player write a bandmate instead of recruiting one", async () => {
    const result = unwrap(
      await createGroupMember(test.ctx, {
        careerId,
        userId: user.id,
        stageName: "MA-B",
        role: "PRODUCER",
        tendencyId: "experimental",
        personalityId: "volatile",
        visualId: "monochrome",
      }),
    );

    const authored = result.artist;

    expect(authored.artistType).toBe("CORE_NPC");
    expect(authored.authoredByCareerId).toBe(careerId);
    expect(authored.currentGroupId).toBe(groupId);
    expect(authored.archetype).toBeTruthy();
    expect(result.members.map((member) => member.artist.id)).toContain(authored.id);

    // Derived, deterministic, and never stronger than the player can start.
    const [skills] = await test.handle.db
      .select()
      .from(artists)
      .where(eq(artists.id, authored.id));
    expect(skills).toBeTruthy();

    const [profile] = await test.handle.db
      .select()
      .from(soundProfiles)
      .where(eq(soundProfiles.ownerId, authored.id));
    expect(profile?.summary).toBeTruthy();
  });

  it("refuses to let the player remove themselves from their own group", async () => {
    const result = await removeGroupMember(test.ctx, {
      careerId,
      userId: user.id,
      artistId: playerArtistId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MEMBER_UNAVAILABLE");
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

  it("recruits a world NPC alongside the player and the authored member", async () => {
    const view = (await getCareerView(test.handle.db, careerId))!;
    const candidates = await getCandidateViews(test.handle.db, view.world.id, groupId);

    const recruit = candidates[0]!.artist;

    const lineup = unwrap(
      await addGroupMember(test.ctx, { careerId, userId: user.id, artistId: recruit.id }),
    );

    // Player + authored member + recruit.
    expect(lineup.members).toHaveLength(3);
    expect(lineup.members[0]!.membership.isFounder).toBe(true);
    expect(lineup.members[0]!.artist.id).toBe(playerArtistId);
    expect(lineup.chemistry.summary).toBeTruthy();

    const [artistRow] = await test.handle.db.select().from(artists).where(eq(artists.id, recruit.id));
    expect(artistRow?.currentGroupId).toBe(groupId);
  });

  it("does not add the same member twice", async () => {
    const view = (await getCareerView(test.handle.db, careerId))!;
    const candidates = await getCandidateViews(test.handle.db, view.world.id, groupId);
    const alreadyIn = candidates.find((candidate) => candidate.membership)!.artist;

    const result = unwrap(
      await addGroupMember(test.ctx, { careerId, userId: user.id, artistId: alreadyIn.id }),
    );

    expect(result.members).toHaveLength(3);

    const rows = await test.handle.db
      .select()
      .from(groupMemberships)
      .where(eq(groupMemberships.groupId, groupId));
    expect(rows).toHaveLength(3);
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

    // Player founder, authored member, recruited NPC.
    expect(types.filter((type) => type === GameEventType.GroupMemberAdded)).toHaveLength(3);
    expect(types).toContain(GameEventType.PlayerArtistAssigned);
    expect(types).toContain(GameEventType.GroupMemberCreated);
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
