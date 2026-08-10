/**
 * Typed domain errors.
 *
 * Commands return these; they never leak database or provider errors to the
 * player. Every error carries a message that is safe to render as-is.
 */
export type DomainErrorCode =
  | "INVALID_CAREER_STATE"
  | "CAREER_ALREADY_EXISTS"
  | "CAREER_NOT_FOUND"
  | "CONTROLLED_ENTITY_MISSING"
  | "INVALID_SOUND_DISCOVERY"
  | "ARTIST_NAME_UNAVAILABLE"
  | "GROUP_NAME_UNAVAILABLE"
  | "UNAUTHORIZED_CAREER_ACCESS"
  | "WORLD_NOT_FOUND"
  | "MEMBER_UNAVAILABLE"
  | "LINEUP_INVALID"
  | "INVALID_INPUT";

export type DomainError = {
  code: DomainErrorCode;
  /** Player-facing copy. */
  message: string;
  /** Form field this error belongs to, when it is a validation failure. */
  field?: string;
  /** Structured context for logs and world-control. Never rendered. */
  meta?: Record<string, unknown>;
};

const build =
  (code: DomainErrorCode, defaultMessage: string) =>
  (message?: string, extra?: Omit<DomainError, "code" | "message">): DomainError => ({
    code,
    message: message ?? defaultMessage,
    ...extra,
  });

export const DomainErrors = {
  invalidCareerState: build(
    "INVALID_CAREER_STATE",
    "That step isn't available from where this career currently is.",
  ),
  careerAlreadyExists: build("CAREER_ALREADY_EXISTS", "You already have a career in this world."),
  careerNotFound: build("CAREER_NOT_FOUND", "We couldn't find that career."),
  controlledEntityMissing: build(
    "CONTROLLED_ENTITY_MISSING",
    "This career doesn't have an artist or group yet.",
  ),
  invalidSoundDiscovery: build(
    "INVALID_SOUND_DISCOVERY",
    "Sound Discovery isn't finished yet.",
  ),
  artistNameUnavailable: build("ARTIST_NAME_UNAVAILABLE", "That name isn't available."),
  groupNameUnavailable: build("GROUP_NAME_UNAVAILABLE", "That group name isn't available."),
  unauthorizedCareerAccess: build(
    "UNAUTHORIZED_CAREER_ACCESS",
    "This career doesn't belong to you.",
  ),
  worldNotFound: build("WORLD_NOT_FOUND", "That world isn't available right now."),
  memberUnavailable: build("MEMBER_UNAVAILABLE", "That artist isn't available to join."),
  lineupInvalid: build("LINEUP_INVALID", "This group needs at least one member."),
  invalidInput: build("INVALID_INPUT", "Check that and try again."),
};
