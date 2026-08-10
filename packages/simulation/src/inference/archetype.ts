import type { ArchetypeKey, SoundDimension, SoundProfileValues } from "@music-rpg/shared";
import { archetypeCatalogue } from "../content/archetypes";

/**
 * Archetype selection, shared by every path that produces an identity.
 *
 * Two inputs: direct evidence (answers, authored choices) and how closely the
 * resulting Sound DNA already resembles each archetype's bias. Ties break on
 * catalogue order so the result is stable for identical input.
 */
export function selectArchetype(
  sound: SoundProfileValues,
  evidence: Partial<Record<ArchetypeKey, number>> = {},
): ArchetypeKey {
  const scored = archetypeCatalogue.map((definition) => {
    const biasAxes = Object.entries(definition.soundBias) as [SoundDimension, number][];
    const affinity =
      biasAxes.length === 0
        ? 0
        : biasAxes.reduce((total, [axis, bias]) => total + bias * sound[axis], 0) / biasAxes.length;

    return {
      key: definition.key,
      total: (evidence[definition.key] ?? 0) + affinity * 6,
    };
  });

  return scored.reduce((leader, entry) => (entry.total > leader.total ? entry : leader), scored[0]!)
    .key;
}
