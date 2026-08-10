import { gameConfig } from "@music-rpg/shared";

/**
 * Moderation port.
 *
 * Player-authored strings (stage names, group names, the free-text philosophy)
 * reach other players' screens once public profiles open up, so every one of
 * them passes through here first. The development implementation is
 * intentionally simple and conservative; a vendor implementation swaps in
 * behind the same interface.
 */
export type ModerationVerdict = {
  allowed: boolean;
  /** Player-facing explanation. Never mentions the rule that fired. */
  reason?: string;
  /** Normalised value the caller should persist (trimmed, collapsed spaces). */
  value: string;
};

export type ModerationContext = "STAGE_NAME" | "GROUP_NAME" | "FREE_TEXT" | "BIOGRAPHY";

export interface ModerationService {
  check(value: string, context: ModerationContext): Promise<ModerationVerdict>;
}

const BLOCKED_PATTERNS: RegExp[] = [
  // Slurs and explicit hate terms are deliberately not enumerated in source;
  // the development list covers impersonation and obvious abuse vectors only.
  /\b(admin|moderator|official|staff)\b/i,
  /https?:\/\//i,
  /[<>{}\\]/,
];

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export class DevelopmentModerationService implements ModerationService {
  async check(rawValue: string, context: ModerationContext): Promise<ModerationVerdict> {
    const value = normalise(rawValue);

    const limits: Record<ModerationContext, { min: number; max: number }> = {
      STAGE_NAME: {
        min: gameConfig.identity.minStageNameLength,
        max: gameConfig.identity.maxStageNameLength,
      },
      GROUP_NAME: {
        min: gameConfig.identity.minStageNameLength,
        max: gameConfig.identity.maxStageNameLength,
      },
      FREE_TEXT: { min: 0, max: gameConfig.identity.maxFreeTextLength },
      BIOGRAPHY: { min: 0, max: gameConfig.identity.maxBiographyLength },
    };

    const limit = limits[context];

    if (value.length < limit.min) {
      return { allowed: false, value, reason: `That needs at least ${limit.min} characters.` };
    }
    if (value.length > limit.max) {
      return { allowed: false, value, reason: `Keep that under ${limit.max} characters.` };
    }
    if (BLOCKED_PATTERNS.some((pattern) => pattern.test(value))) {
      return { allowed: false, value, reason: "That name isn't available. Try another." };
    }

    return { allowed: true, value };
  }
}

/** Used in tests where moderation is not the thing under test. */
export class AllowAllModerationService implements ModerationService {
  async check(value: string): Promise<ModerationVerdict> {
    return { allowed: true, value: normalise(value) };
  }
}
