import { eq } from "drizzle-orm";
import { ids, slugify } from "@music-rpg/shared";
import {
  archetypeCatalogue,
  audienceCohortSeeds,
  candidateSeeds,
  describeSound,
  discoveryQuestions,
  expandPsychology,
  expandSkills,
  expandSound,
  traitCatalogue,
  worldCharacterSeeds,
  worldSeeds,
} from "@music-rpg/simulation";
import type { Database } from "../client";
import {
  archetypeDefinitions,
  artistPsychology,
  artistSkills,
  artistTraits,
  artists,
  audienceCohorts,
  characters,
  scenes,
  soundDiscoveryQuestions,
  soundProfiles,
  traitDefinitions,
  worlds,
} from "../schema";

/**
 * Development seed.
 *
 * Idempotent — running it twice changes nothing — because it doubles as the
 * bootstrap for a fresh embedded database in dev, tests and E2E. No seed data
 * is hardcoded in a UI component: archetypes, traits, questions, the world and
 * the candidate members all come from here.
 */
export type SeedResult = {
  worlds: number;
  scenes: number;
  archetypes: number;
  traits: number;
  questions: number;
  candidates: number;
  characters: number;
  audienceCohorts: number;
};

export async function seedDatabase(db: Database): Promise<SeedResult> {
  const result: SeedResult = {
    worlds: 0,
    scenes: 0,
    archetypes: 0,
    traits: 0,
    questions: 0,
    candidates: 0,
    characters: 0,
    audienceCohorts: 0,
  };

  // --- Archetypes ---------------------------------------------------------
  for (const archetype of archetypeCatalogue) {
    await db
      .insert(archetypeDefinitions)
      .values({
        key: archetype.key,
        name: archetype.name,
        tagline: archetype.tagline,
        description: archetype.description,
        soundBias: archetype.soundBias,
        skillBias: archetype.skillBias,
        psychologyBias: archetype.psychologyBias,
      })
      .onConflictDoUpdate({
        target: archetypeDefinitions.key,
        set: {
          name: archetype.name,
          tagline: archetype.tagline,
          description: archetype.description,
          soundBias: archetype.soundBias,
          skillBias: archetype.skillBias,
          psychologyBias: archetype.psychologyBias,
        },
      });
    result.archetypes += 1;
  }

  // --- Traits -------------------------------------------------------------
  for (const trait of traitCatalogue) {
    await db
      .insert(traitDefinitions)
      .values({
        key: trait.key,
        name: trait.name,
        description: trait.description,
        category: trait.category,
      })
      .onConflictDoUpdate({
        target: traitDefinitions.key,
        set: { name: trait.name, description: trait.description, category: trait.category },
      });
    result.traits += 1;
  }

  // --- Sound Discovery questions -----------------------------------------
  for (const question of discoveryQuestions) {
    await db
      .insert(soundDiscoveryQuestions)
      .values({
        id: question.id,
        version: question.version,
        orderIndex: question.orderIndex,
        prompt: question.prompt,
        helpText: question.helpText ?? null,
        kind: question.kind,
        appliesTo: question.appliesTo,
        options: question.options,
      })
      .onConflictDoUpdate({
        target: soundDiscoveryQuestions.id,
        set: {
          version: question.version,
          orderIndex: question.orderIndex,
          prompt: question.prompt,
          helpText: question.helpText ?? null,
          kind: question.kind,
          appliesTo: question.appliesTo,
          options: question.options,
        },
      });
    result.questions += 1;
  }

  // --- Worlds, scenes and their NPC population ---------------------------
  for (const worldSeed of worldSeeds) {
    const existing = await db.select().from(worlds).where(eq(worlds.slug, worldSeed.slug)).limit(1);

    let worldId = existing[0]?.id;
    if (!worldId) {
      const inserted = await db
        .insert(worlds)
        .values({
          id: ids.world(),
          name: worldSeed.name,
          slug: worldSeed.slug,
          status: "ACTIVE",
          currentGameTime: new Date(worldSeed.currentGameTime),
        })
        .returning();
      worldId = inserted[0]!.id;
      result.worlds += 1;
    }

    for (const scene of worldSeed.scenes) {
      await db
        .insert(scenes)
        .values({
          id: ids.generic(),
          worldId,
          name: scene.name,
          slug: scene.slug,
          description: scene.description,
        })
        .onConflictDoNothing({ target: [scenes.worldId, scenes.slug] });
      result.scenes += 1;
    }

    /*
     * --- Audiences ------------------------------------------------------
     *
     * World population, not career state. These exist before any artist does,
     * and every career releasing into this world addresses the same people.
     */
    for (const cohort of audienceCohortSeeds) {
      const values = {
        name: cohort.name,
        description: cohort.description,
        size: cohort.size,
        preferences: cohort.preferences,
        behaviouralWeights: cohort.behaviour,
        sceneAffinity: cohort.sceneAffinity,
        updatedAt: new Date(),
      };

      await db
        .insert(audienceCohorts)
        .values({ id: ids.generic(), worldId, slug: cohort.slug, ...values })
        .onConflictDoUpdate({
          target: [audienceCohorts.worldId, audienceCohorts.slug],
          set: values,
        });
      result.audienceCohorts += 1;
    }

    // --- Characters: the connector, the producers, the promoters ----------
    for (const character of worldCharacterSeeds) {
      const values = {
        worldId,
        name: character.name,
        role: character.role,
        tier: character.tier,
        biography: character.biography,
        quote: character.quote,
        origin: character.origin,
        personality: character.personality,
        motives: character.motives,
        /*
         * Structured profiles the engines read: the producer's is what the
         * interpretation engine works from, the promoter's is what the
         * opportunity director works from. Neither is decoration and neither is
         * a prompt.
         */
        preferences: {
          ...(character.producer ? { producer: character.producer } : {}),
          ...(character.promoter ? { promoter: character.promoter } : {}),
        },
        currentGoal: character.currentGoal ?? null,
        currentMood: character.currentMood ?? null,
      };

      await db
        .insert(characters)
        .values({ id: ids.generic(), slug: character.slug, ...values })
        .onConflictDoUpdate({
          target: [characters.worldId, characters.slug],
          set: values,
        });
      result.characters += 1;
    }

    for (const candidate of candidateSeeds) {
      const slug = slugify(candidate.slug);
      const existingArtist = await db
        .select()
        .from(artists)
        .where(eq(artists.slug, slug))
        .limit(1);

      if (existingArtist[0]) continue;

      const artistId = ids.artist();
      const sound = expandSound(candidate.sound);
      const skills = expandSkills(candidate.skills);
      const psychology = expandPsychology(candidate.psychology);

      await db.insert(artists).values({
        id: artistId,
        worldId,
        stageName: candidate.stageName,
        slug,
        origin: candidate.origin,
        biography: candidate.biography,
        // Fixture members are ordinary world NPCs — nothing about them is
        // special-cased for the group picker.
        artistType: "WORLD_NPC",
        status: "ACTIVE",
        archetype: candidate.archetype,
        creativePhilosophy: candidate.tendency,
        preferredRole: candidate.role,
        isPublic: true,
      });

      await db.insert(artistSkills).values({
        artistId,
        lyricism: skills.lyricism,
        flow: skills.flow,
        melody: skills.melody,
        storytelling: skills.storytelling,
        performance: skills.performance,
        production: skills.production,
        experimentation: skills.experimentation,
        versatility: skills.versatility,
        battleIq: skills.battleIQ,
      });

      await db.insert(artistPsychology).values({
        artistId,
        confidence: psychology.confidence,
        discipline: psychology.discipline,
        ambition: psychology.ambition,
        resilience: psychology.resilience,
        ego: psychology.ego,
        patience: psychology.patience,
        adaptability: psychology.adaptability,
        riskTolerance: psychology.riskTolerance,
        competitiveness: psychology.competitiveness,
      });

      await db.insert(soundProfiles).values({
        id: ids.soundProfile(),
        ownerType: "ARTIST",
        ownerId: artistId,
        ...sound,
        summary: describeSound(sound),
        derivedFrom: { source: "seed", slug: candidate.slug },
      });

      for (const traitKey of candidate.traits) {
        await db.insert(artistTraits).values({
          id: ids.trait(),
          artistId,
          traitKey,
          source: "SEED",
          strength: 60,
        });
      }

      result.candidates += 1;
    }
  }

  return result;
}
