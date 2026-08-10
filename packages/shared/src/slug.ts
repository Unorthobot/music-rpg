/**
 * Slug generation for public identity routes (/artist/[slug], /group/[slug]).
 *
 * Slugs are part of the public surface, so they must be stable, lowercase,
 * URL-safe, and free of the accidental characters stage names attract.
 */

const MAX_SLUG_LENGTH = 48;

/** Words that would collide with application routes if used as a slug. */
export const RESERVED_SLUGS = new Set([
  "new",
  "edit",
  "settings",
  "admin",
  "api",
  "me",
  "home",
  "world",
  "studio",
  "career",
  "crew",
  "search",
  "login",
  "logout",
  "register",
  "start",
  "world-control",
  "artist",
  "group",
]);

export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    // strip combining marks so "Ké" becomes "ke" rather than "k"
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");

  return base;
}

/**
 * Builds a slug that does not collide with `isTaken` or the reserved list.
 * Suffixes are numeric and deterministic so retries of the same creation
 * command converge instead of drifting.
 */
export async function uniqueSlug(
  input: string,
  isTaken: (candidate: string) => Promise<boolean>,
  fallback = "artist",
): Promise<string> {
  const base = slugify(input) || fallback;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (RESERVED_SLUGS.has(candidate)) continue;
    if (!(await isTaken(candidate))) return candidate;
  }

  // Extremely contended name: fall back to a random discriminator.
  const suffix = Math.floor(Math.random() * 1_000_000).toString(36);
  return `${base}-${suffix}`;
}
