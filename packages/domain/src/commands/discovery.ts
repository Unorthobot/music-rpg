import { eq } from "drizzle-orm";
import {
  artistPsychology,
  artistSkills,
  artistTraits,
  artists,
  careers,
  groups,
  soundDiscoverySessions,
  type SoundDiscoverySessionRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import {
  err,
  gameConfig,
  ids,
  isDiscoveryComplete,
  ok,
  type DiscoveryQuestion,
  type Result,
} from "@music-rpg/shared";
import { inferIdentity, type InferredIdentity } from "@music-rpg/simulation";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import {
  loadDiscoveryQuestions,
  loadDiscoverySession,
  writeSoundProfile,
} from "../internal/discovery";

export type SaveDiscoveryAnswerInput = {
  careerId: string;
  userId: string;
  questionId: string;
  /** Option id for CHOICE questions, free text for FREE_TEXT questions. */
  value: string;
};

export type DiscoveryProgress = {
  session: SoundDiscoverySessionRow;
  questions: DiscoveryQuestion[];
  complete: boolean;
};

/**
 * Persists a single answer.
 *
 * Written per-answer rather than at the end of the flow: the player can put
 * their phone down on question three and pick up on a laptop at question three.
 */
export async function saveDiscoveryAnswer(
  ctx: CommandContext,
  input: SaveDiscoveryAnswerInput,
): Promise<Result<DiscoveryProgress, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  if (!career.careerType) {
    return err(DomainErrors.invalidCareerState("Choose solo or group first."));
  }

  const questions = await loadDiscoveryQuestions(ctx.db, career.careerType);
  const question = questions.find((candidate) => candidate.id === input.questionId);
  if (!question) {
    return err(DomainErrors.invalidSoundDiscovery("That question isn't part of this flow."));
  }

  let value = input.value;
  if (question.kind === "CHOICE") {
    if (!question.options.some((option) => option.id === value)) {
      return err(DomainErrors.invalidSoundDiscovery("That answer isn't one of the options."));
    }
  } else {
    const verdict = await ctx.moderation.check(value, "FREE_TEXT");
    if (!verdict.allowed) {
      return err(DomainErrors.invalidInput(verdict.reason, { field: input.questionId }));
    }
    value = verdict.value.slice(0, gameConfig.identity.maxFreeTextLength);
  }

  const session = await loadDiscoverySession(ctx.db, career.id);
  if (!session) {
    return err(DomainErrors.invalidCareerState("Sound Discovery hasn't started for this career."));
  }
  if (session.status === "COMPLETED") {
    // Answers are frozen once discovery is complete; Tune It is the way to
    // adjust identity afterwards.
    return err(DomainErrors.invalidSoundDiscovery("Sound Discovery is already complete."));
  }

  const now = contextNow(ctx);
  const isFirstAnswer = Object.keys(session.responses).length === 0;
  const responses = { ...session.responses, [input.questionId]: value };

  const updated = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .update(soundDiscoverySessions)
      .set({ responses, updatedAt: now })
      .where(eq(soundDiscoverySessions.id, session.id))
      .returning();

    if (isFirstAnswer) {
      await recordEvent(tx, {
        worldId: career.worldId,
        careerId: career.id,
        eventType: GameEventType.SoundDiscoveryStarted,
        actorType: "USER",
        actorId: input.userId,
        targetType: "CAREER",
        targetId: career.id,
        visibility: "PRIVATE",
        importance: 20,
        idempotencyKey: `career:${career.id}:discovery:started`,
        payload: { subjectType: session.subjectType },
      });
    }

    await tx
      .update(careers)
      .set({ lastActiveAt: now, updatedAt: now })
      .where(eq(careers.id, career.id));

    return rows[0];
  });

  if (!updated) return err(DomainErrors.invalidSoundDiscovery());

  if (isFirstAnswer) {
    await track(ctx, {
      name: "sound_discovery_started",
      userId: input.userId,
      careerId: career.id,
      properties: { subjectType: session.subjectType },
    });
  }

  await track(ctx, {
    name: "sound_discovery_answered",
    userId: input.userId,
    careerId: career.id,
    properties: {
      questionId: input.questionId,
      // The chosen option id is a design signal; free text is never sent to
      // analytics.
      answer: question.kind === "CHOICE" ? value : "[free_text]",
      answered: Object.keys(responses).length,
      total: questions.length,
    },
  });

  return ok({
    session: updated,
    questions,
    complete: isDiscoveryComplete(questions, responses),
  });
}

export type CompleteSoundDiscoveryResult = {
  identity: InferredIdentity;
  alreadyCompleted: boolean;
};

/**
 * CompleteSoundDiscovery.
 *
 * Runs the deterministic inference engine and writes the derived identity:
 * Sound DNA, starting skills, psychology, archetype and initial traits. No
 * model call is involved — an AI layer may later enrich the *language* around
 * these values, never the values themselves.
 */
export async function completeSoundDiscovery(
  ctx: CommandContext,
  input: { careerId: string; userId: string },
): Promise<Result<CompleteSoundDiscoveryResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  if (!career.careerType) {
    return err(DomainErrors.invalidCareerState("Choose solo or group first."));
  }
  if (!career.controlledEntityId || !career.controlledEntityType) {
    return err(DomainErrors.controlledEntityMissing());
  }

  const session = await loadDiscoverySession(ctx.db, career.id);
  if (!session) return err(DomainErrors.invalidSoundDiscovery("Sound Discovery hasn't started."));

  const questions = await loadDiscoveryQuestions(ctx.db, career.careerType);
  if (!isDiscoveryComplete(questions, session.responses)) {
    return err(DomainErrors.invalidSoundDiscovery("There are still questions to answer."));
  }

  const identity = inferIdentity({ questions, responses: session.responses });

  if (session.status === "COMPLETED") {
    // Idempotent: the same answers always infer the same artist, so a retry
    // returns the identity without rewriting state or re-emitting events.
    return ok({ identity, alreadyCompleted: true });
  }

  const now = contextNow(ctx);
  const entityId = career.controlledEntityId;
  const isArtist = career.controlledEntityType === "ARTIST";

  await ctx.db.transaction(async (tx) => {
    await writeSoundProfile(tx, {
      ownerType: isArtist ? "ARTIST" : "GROUP",
      ownerId: entityId,
      values: identity.sound,
      summary: identity.soundSummary,
      derivedFrom: identity.provenance,
      now,
    });

    if (isArtist) {
      await tx
        .update(artists)
        .set({
          archetype: identity.archetype,
          creativePhilosophy: identity.creativePhilosophy,
          updatedAt: now,
        })
        .where(eq(artists.id, entityId));

      await tx
        .update(artistSkills)
        .set({
          lyricism: identity.skills.lyricism,
          flow: identity.skills.flow,
          melody: identity.skills.melody,
          storytelling: identity.skills.storytelling,
          performance: identity.skills.performance,
          production: identity.skills.production,
          experimentation: identity.skills.experimentation,
          versatility: identity.skills.versatility,
          battleIq: identity.skills.battleIQ,
          updatedAt: now,
        })
        .where(eq(artistSkills.artistId, entityId));

      await tx
        .update(artistPsychology)
        .set({
          confidence: identity.psychology.confidence,
          discipline: identity.psychology.discipline,
          ambition: identity.psychology.ambition,
          resilience: identity.psychology.resilience,
          ego: identity.psychology.ego,
          patience: identity.psychology.patience,
          adaptability: identity.psychology.adaptability,
          riskTolerance: identity.psychology.riskTolerance,
          competitiveness: identity.psychology.competitiveness,
          updatedAt: now,
        })
        .where(eq(artistPsychology.artistId, entityId));

      // Traits are replaced wholesale: discovery is the sole source of the
      // starting set, and re-running it must not accumulate duplicates.
      await tx.delete(artistTraits).where(eq(artistTraits.artistId, entityId));
      for (const trait of identity.traits) {
        await tx.insert(artistTraits).values({
          id: ids.trait(),
          artistId: entityId,
          traitKey: trait.key,
          source: "DISCOVERY",
          strength: trait.strength,
          acquiredAt: now,
        });
      }

      await recordEvent(tx, {
        worldId: career.worldId,
        careerId: career.id,
        eventType: GameEventType.ArtistIdentityEstablished,
        actorType: "ARTIST",
        actorId: entityId,
        targetType: "ARTIST",
        targetId: entityId,
        visibility: "PRIVATE",
        importance: 80,
        idempotencyKey: `artist:${entityId}:identity_established`,
        payload: {
          archetype: identity.archetype,
          traits: identity.traits.map((trait) => trait.key),
          soundSummary: identity.soundSummary,
        },
      });
    } else {
      await tx
        .update(groups)
        .set({
          archetype: identity.archetype,
          creativePhilosophy: identity.creativePhilosophy,
          updatedAt: now,
        })
        .where(eq(groups.id, entityId));

      await recordEvent(tx, {
        worldId: career.worldId,
        careerId: career.id,
        eventType: GameEventType.GroupIdentityEstablished,
        actorType: "GROUP",
        actorId: entityId,
        targetType: "GROUP",
        targetId: entityId,
        visibility: "PRIVATE",
        importance: 80,
        idempotencyKey: `group:${entityId}:identity_established`,
        payload: {
          archetype: identity.archetype,
          soundSummary: identity.soundSummary,
        },
      });
    }

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.SoundDiscoveryCompleted,
      actorType: "USER",
      actorId: input.userId,
      targetType: career.controlledEntityType,
      targetId: entityId,
      visibility: "PRIVATE",
      importance: 60,
      idempotencyKey: `career:${career.id}:discovery:completed`,
      payload: {
        version: identity.version,
        archetype: identity.archetype,
        sound: identity.sound,
      },
    });

    await tx
      .update(soundDiscoverySessions)
      .set({ status: "COMPLETED", completedAt: now, updatedAt: now })
      .where(eq(soundDiscoverySessions.id, session.id));

    await tx
      .update(careers)
      .set({
        // Group careers still have to assemble a line-up before the reveal.
        onboardingState: isArtist ? "REVEAL" : "MEMBERS",
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(careers.id, career.id));
  });

  await track(ctx, {
    name: "sound_discovery_completed",
    userId: input.userId,
    careerId: career.id,
    properties: {
      archetype: identity.archetype,
      traits: identity.traits.map((trait) => trait.key),
      subjectType: session.subjectType,
    },
  });

  return ok({ identity, alreadyCompleted: false });
}
