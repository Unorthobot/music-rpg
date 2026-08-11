/**
 * Product analytics vocabulary.
 *
 * Separate from the canonical game event log by design: this measures the
 * funnel, that records the fiction. Never derive one from the other.
 */
export const ANALYTICS_EVENTS = [
  "account_created",
  "career_creation_started",
  "career_type_selected",
  "artist_creation_started",
  "group_creation_started",
  "sound_discovery_started",
  "sound_discovery_answered",
  "sound_discovery_completed",
  "artist_created",
  "founding_artist_created",
  "group_created",
  "group_member_created",
  "group_lineup_confirmed",
  "artist_reveal_viewed",
  "artist_tuned",
  "group_reveal_viewed",
  "career_onboarding_completed",
  "home_viewed",
  "home_first_viewed",

  /* --- M2: Career HQ --------------------------------------------------- */
  "home_right_now_viewed",
  "npc_conversation_opened",
  "producer_opportunity_viewed",
  "producer_selected",
  "calendar_viewed",
  "studio_session_cta_clicked",

  /* --- M3: Studio ------------------------------------------------------ */
  "studio_home_viewed",
  "new_session_started",
  "creative_direction_started",
  "creative_direction_submitted",
  "producer_interpretation_viewed",
  "producer_proposal_selected",
  "producer_proposal_rejected",
  "producer_proposals_combined",
  "quick_render_requested",
  "quick_render_completed",
  "track_version_reviewed",
  "revision_requested",
  "master_requested",
  "master_completed",
  "track_saved",
  "studio_session_completed",

  /* --- M4: Releases ---------------------------------------------------- */
  "catalogue_viewed",
  "release_planning_started",
  "release_format_selected",
  "release_strategy_selected",
  "release_scheduled",
  "release_published",
  "track_kept_private",

  /* --- M5: Reception --------------------------------------------------- */
  "reception_tick_simulated",

  /* --- M6: Crew & Relationships ---------------------------------------- */
  "crew_member_joined",
  "crew_invite_declined",
  "relationship_moment_answered",

  /* --- M7: Missions & the Opportunity Director ------------------------- */
  "opportunity_director_ran",
  "opportunity_accepted",
  "opportunity_declined",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  userId?: string | null;
  careerId?: string | null;
  anonymousId?: string | null;
  properties?: Record<string, unknown>;
  occurredAt?: Date;
};
