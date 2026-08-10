import type { EventActorType, EventVisibility } from "@music-rpg/shared";

/**
 * Canonical event catalogue.
 *
 * Names are dot.case and stable — they are persisted forever. The constant
 * names below map one-to-one onto the milestone's required events; the string
 * values are the storage form.
 */
export const GameEventType = {
  CareerCreated: "career.created",
  CareerTypeSelected: "career.type_selected",
  SoloArtistCreated: "artist.created",
  ArtistIdentityEstablished: "artist.identity_established",
  ArtistIdentityTuned: "artist.identity_tuned",
  GroupCreated: "group.created",
  GroupIdentityEstablished: "group.identity_established",
  GroupMemberAdded: "group.member_added",
  GroupMemberRemoved: "group.member_removed",
  SoundDiscoveryStarted: "sound_discovery.started",
  SoundDiscoveryCompleted: "sound_discovery.completed",
  ControlledEntityAssigned: "career.controlled_entity_assigned",
  CareerOnboardingCompleted: "career.onboarding_completed",
  CareerEnteredUnderground: "career.entered_underground",
} as const;

export type GameEventTypeKey = keyof typeof GameEventType;
export type GameEventTypeValue = (typeof GameEventType)[GameEventTypeKey];

/** Human labels for world-control and, later, player-facing feeds. */
export const gameEventLabels: Record<GameEventTypeValue, string> = {
  "career.created": "Career created",
  "career.type_selected": "Career type selected",
  "artist.created": "Solo artist created",
  "artist.identity_established": "Artist identity established",
  "artist.identity_tuned": "Artist identity tuned",
  "group.created": "Group created",
  "group.identity_established": "Group identity established",
  "group.member_added": "Group member added",
  "group.member_removed": "Group member removed",
  "sound_discovery.started": "Sound discovery started",
  "sound_discovery.completed": "Sound discovery completed",
  "career.controlled_entity_assigned": "Controlled entity assigned",
  "career.onboarding_completed": "Career onboarding completed",
  "career.entered_underground": "Career entered The Underground",
};

export type RecordEventInput = {
  worldId: string;
  careerId?: string | null;
  eventType: GameEventTypeValue;
  actorType: EventActorType;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  visibility?: EventVisibility;
  /** 1 (routine) – 100 (career-defining). */
  importance?: number;
  payload?: Record<string, unknown>;
  /** In-world time. Defaults to the world's current game time when omitted. */
  occurredAt?: Date;
  /**
   * Set by commands that must not double-write on retry. Two calls with the
   * same key produce exactly one event.
   */
  idempotencyKey?: string | null;
};
