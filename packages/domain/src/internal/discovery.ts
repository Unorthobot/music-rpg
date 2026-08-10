import { asc, eq, inArray } from "drizzle-orm";
import {
  soundDiscoveryQuestions,
  soundDiscoverySessions,
  soundProfiles,
  type DbClient,
  type SoundDiscoverySessionRow,
} from "@music-rpg/database";
import {
  ids,
  questionsForAudience,
  type CareerType,
  type DiscoveryQuestion,
  type SoundProfileValues,
} from "@music-rpg/shared";

/**
 * Discovery questions are read from the database, not imported from the
 * content module, so a live deployment can reword or reweight a question
 * without a code release.
 */
export async function loadDiscoveryQuestions(
  db: DbClient,
  careerType: CareerType,
  version = 1,
): Promise<DiscoveryQuestion[]> {
  const rows = await db
    .select()
    .from(soundDiscoveryQuestions)
    .where(eq(soundDiscoveryQuestions.version, version))
    .orderBy(asc(soundDiscoveryQuestions.orderIndex));

  const questions: DiscoveryQuestion[] = rows.map((row) => ({
    id: row.id,
    version: row.version,
    orderIndex: row.orderIndex,
    prompt: row.prompt,
    helpText: row.helpText,
    kind: row.kind,
    appliesTo: row.appliesTo,
    options: row.options,
  }));

  return questionsForAudience(questions, careerType);
}

export async function loadDiscoverySession(
  db: DbClient,
  careerId: string,
): Promise<SoundDiscoverySessionRow | undefined> {
  const rows = await db
    .select()
    .from(soundDiscoverySessions)
    .where(eq(soundDiscoverySessions.careerId, careerId))
    .limit(1);
  return rows[0];
}

/** Upserts Sound DNA for an artist or a group. */
export async function writeSoundProfile(
  tx: DbClient,
  input: {
    ownerType: "ARTIST" | "GROUP";
    ownerId: string;
    values: SoundProfileValues;
    summary: string;
    derivedFrom: Record<string, unknown>;
    now: Date;
  },
): Promise<void> {
  const payload = {
    darkBright: input.values.darkBright,
    rawPolished: input.values.rawPolished,
    minimalDense: input.values.minimalDense,
    organicElectronic: input.values.organicElectronic,
    classicFuturistic: input.values.classicFuturistic,
    accessibleExperimental: input.values.accessibleExperimental,
    melodicRhythmic: input.values.melodicRhythmic,
    intimateAnthemic: input.values.intimateAnthemic,
    summary: input.summary,
    derivedFrom: input.derivedFrom,
    updatedAt: input.now,
  };

  await tx
    .insert(soundProfiles)
    .values({
      id: ids.soundProfile(),
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      ...payload,
    })
    .onConflictDoUpdate({
      target: [soundProfiles.ownerType, soundProfiles.ownerId],
      set: payload,
    });
}

export async function loadSoundProfile(
  db: DbClient,
  ownerType: "ARTIST" | "GROUP",
  ownerIds: string[],
) {
  if (ownerIds.length === 0) return [];
  return db
    .select()
    .from(soundProfiles)
    .where(inArray(soundProfiles.ownerId, ownerIds))
    .then((rows) => rows.filter((row) => row.ownerType === ownerType));
}

/** Row → plain axis values, for the inference engine and the UI. */
export function soundProfileValues(row: {
  darkBright: number;
  rawPolished: number;
  minimalDense: number;
  organicElectronic: number;
  classicFuturistic: number;
  accessibleExperimental: number;
  melodicRhythmic: number;
  intimateAnthemic: number;
}): SoundProfileValues {
  return {
    darkBright: row.darkBright,
    rawPolished: row.rawPolished,
    minimalDense: row.minimalDense,
    organicElectronic: row.organicElectronic,
    classicFuturistic: row.classicFuturistic,
    accessibleExperimental: row.accessibleExperimental,
    melodicRhythmic: row.melodicRhythmic,
    intimateAnthemic: row.intimateAnthemic,
  };
}
