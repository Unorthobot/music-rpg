import { eq } from "drizzle-orm";
import {
  artistPsychology,
  artistSkills,
  artistTraits,
  type DbClient,
} from "@music-rpg/database";
import {
  ids,
  type PsychologyValues,
  type SkillValues,
  type TraitKey,
} from "@music-rpg/shared";

/**
 * Shared writers for an artist's derived state.
 *
 * Discovery (the player's own artist) and member authoring (a bandmate) both
 * produce the same shapes, so they write through the same functions — one
 * place to change when a skill or trait gains a column.
 */
export async function writeArtistSkills(
  tx: DbClient,
  artistId: string,
  skills: SkillValues,
  now: Date,
  mode: "insert" | "update" = "update",
): Promise<void> {
  const values = {
    lyricism: skills.lyricism,
    flow: skills.flow,
    melody: skills.melody,
    storytelling: skills.storytelling,
    performance: skills.performance,
    production: skills.production,
    experimentation: skills.experimentation,
    versatility: skills.versatility,
    battleIq: skills.battleIQ,
    updatedAt: now,
  };

  if (mode === "insert") {
    await tx.insert(artistSkills).values({ artistId, ...values });
    return;
  }
  await tx.update(artistSkills).set(values).where(eq(artistSkills.artistId, artistId));
}

export async function writeArtistPsychology(
  tx: DbClient,
  artistId: string,
  psychology: PsychologyValues,
  now: Date,
  mode: "insert" | "update" = "update",
): Promise<void> {
  const values = {
    confidence: psychology.confidence,
    discipline: psychology.discipline,
    ambition: psychology.ambition,
    resilience: psychology.resilience,
    ego: psychology.ego,
    patience: psychology.patience,
    adaptability: psychology.adaptability,
    riskTolerance: psychology.riskTolerance,
    competitiveness: psychology.competitiveness,
    updatedAt: now,
  };

  if (mode === "insert") {
    await tx.insert(artistPsychology).values({ artistId, ...values });
    return;
  }
  await tx.update(artistPsychology).set(values).where(eq(artistPsychology.artistId, artistId));
}

/**
 * Replaces an artist's trait set wholesale. Inference is the sole source of the
 * starting traits, so re-deriving must not accumulate duplicates.
 */
export async function replaceArtistTraits(
  tx: DbClient,
  artistId: string,
  traits: { key: TraitKey; strength: number }[],
  source: string,
  now: Date,
): Promise<void> {
  await tx.delete(artistTraits).where(eq(artistTraits.artistId, artistId));

  for (const trait of traits) {
    await tx.insert(artistTraits).values({
      id: ids.trait(),
      artistId,
      traitKey: trait.key,
      source,
      strength: trait.strength,
      acquiredAt: now,
    });
  }
}
