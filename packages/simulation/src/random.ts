/**
 * Deterministic randomness.
 *
 * Every generator in the simulation is seeded from state the caller already
 * has, so the same world produces the same outcome on every machine and every
 * replay. `Math.random` never appears in simulation code: a result nobody can
 * reproduce cannot be explained, and explaining outcomes is the whole point.
 */

/** FNV-1a. Stable across runtimes — the same string always gives the same seed. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32. Small, fast and reproducible; not for anything cryptographic. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: a generator seeded from the string form of its inputs. */
export function seededFrom(...parts: (string | number)[]): () => number {
  return seeded(hashString(parts.join(":")));
}

/**
 * A single reproducible value in [-spread, +spread] around 1.
 *
 * Used where a simulation wants texture rather than a stream of numbers: the
 * same inputs always jitter by the same amount.
 */
export function seededJitter(spread: number, ...parts: (string | number)[]): number {
  return 1 + (seededFrom(...parts)() * 2 - 1) * spread;
}
