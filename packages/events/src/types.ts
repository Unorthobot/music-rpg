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
  /** Any artist coming into existence: the player's own, or one they authored. */
  ArtistCreated: "artist.created",
  /** Retained alias — same stored value, kept so existing call sites read clearly. */
  SoloArtistCreated: "artist.created",
  /** The career's player-owned artist was attached (solo or group founder). */
  PlayerArtistAssigned: "career.player_artist_assigned",
  /** A bandmate written by the player rather than recruited from the world. */
  GroupMemberCreated: "group.member_created",
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

  /* --- M2: Career HQ --------------------------------------------------- */
  CharacterFirstContactCreated: "character.first_contact_created",
  NpcMessageSent: "npc.message_sent",
  OpportunityCreated: "opportunity.created",
  OpportunityAccepted: "opportunity.accepted",
  OpportunityResolved: "opportunity.resolved",
  ProducerSelected: "producer.selected",
  CalendarItemCreated: "calendar_item.created",
  CalendarItemCompleted: "calendar_item.completed",
  TransactionRecorded: "transaction.recorded",

  /* --- M3: Studio ------------------------------------------------------ */
  CreativeSessionCreated: "creative_session.created",
  CreativeSessionStarted: "creative_session.started",
  CreativeDirectionSet: "creative_direction.set",
  ProducerInterpretationCreated: "producer.interpretation_created",
  CreativeDecisionRecorded: "creative_decision.recorded",
  TrackCreated: "track.created",
  TrackVersionCreated: "track_version.created",
  GenerationRequested: "generation.requested",
  GenerationCompleted: "generation.completed",
  GenerationFailed: "generation.failed",
  TrackVersionMastered: "track_version.mastered",
  TrackRenamed: "track.renamed",
  TrackSavedToCatalogue: "track.saved_to_catalogue",
  CreativeSessionCompleted: "creative_session.completed",

  /* --- M4: Releases ---------------------------------------------------- */
  TrackKeptPrivate: "track.kept_private",
  ReleasePlanned: "release.planned",
  ReleaseFormatChosen: "release.format_chosen",
  ReleaseStrategySet: "release.strategy_set",
  ReleaseScheduled: "release.scheduled",
  ReleaseCancelled: "release.cancelled",
  ReleasePublished: "release.published",

  /* --- M5: Reception --------------------------------------------------- */
  /**
   * Reception is eventful, not merely numerical. These are what let world
   * control answer "where did these numbers come from?" — every projected
   * figure is the sum of a history that is still here.
   */
  ReceptionExposureOccurred: "reception.exposure_occurred",
  ReceptionEngagementOccurred: "reception.engagement_occurred",
  ReceptionFanConversionOccurred: "reception.fan_conversion_occurred",
  ReceptionWordOfMouthOccurred: "reception.word_of_mouth_occurred",
  /** Fame / Respect / Heat movement, with the reception facts that caused it. */
  ReceptionMetricPressureApplied: "reception.metric_pressure_applied",
  ReceptionTickCompleted: "reception.tick_completed",
} as const;

export type GameEventTypeKey = keyof typeof GameEventType;
export type GameEventTypeValue = (typeof GameEventType)[GameEventTypeKey];

/** Human labels for world-control and, later, player-facing feeds. */
export const gameEventLabels: Record<GameEventTypeValue, string> = {
  "career.created": "Career created",
  "career.type_selected": "Career type selected",
  "artist.created": "Artist created",
  "career.player_artist_assigned": "Player artist assigned",
  "group.member_created": "Group member created",
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

  "character.first_contact_created": "First contact made",
  "npc.message_sent": "Message received",
  "opportunity.created": "Opportunity appeared",
  "opportunity.accepted": "Opportunity accepted",
  "opportunity.resolved": "Opportunity resolved",
  "producer.selected": "Producer chosen",
  "calendar_item.created": "Scheduled",
  "calendar_item.completed": "Calendar item completed",
  "transaction.recorded": "Money moved",

  "creative_session.created": "Studio session booked",
  "creative_session.started": "Studio session started",
  "creative_direction.set": "Creative direction set",
  "producer.interpretation_created": "Producer responded",
  "creative_decision.recorded": "Creative decision made",
  "track.created": "Track started",
  "track_version.created": "Version created",
  "generation.requested": "Render requested",
  "generation.completed": "Render completed",
  "generation.failed": "Render failed",
  "track_version.mastered": "Version mastered",
  "track.renamed": "Track renamed",
  "track.saved_to_catalogue": "Track saved to catalogue",
  "creative_session.completed": "Studio session completed",

  "track.kept_private": "Track kept private",
  "release.planned": "Release planned",
  "release.format_chosen": "Release format chosen",
  "release.strategy_set": "Release strategy set",
  "release.scheduled": "Release scheduled",
  "release.cancelled": "Release cancelled",
  "release.published": "Released",

  "reception.exposure_occurred": "People came across it",
  "reception.engagement_occurred": "People listened properly",
  "reception.fan_conversion_occurred": "New fans",
  "reception.word_of_mouth_occurred": "Passed around",
  "reception.metric_pressure_applied": "Standing moved",
  "reception.tick_completed": "Reception simulated",
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
