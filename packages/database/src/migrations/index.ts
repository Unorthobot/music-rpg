import { migration0001Init } from "./0001_init";
import { migration0002M11Hardening } from "./0002_m11_hardening";
import { migration0003M2CareerHq } from "./0003_m2_career_hq";
import { migration0004M3Studio } from "./0004_m3_studio";
import { migration0005M4Releases } from "./0005_m4_releases";
import { migration0006M5Reception } from "./0006_m5_reception";
import { migration0007M5ListenerSemantics } from "./0007_m5_listener_semantics";
import { migration0008M6Relationships } from "./0008_m6_relationships";
import { migration0009M6Crew } from "./0009_m6_crew";
import { migration0010M6Moments } from "./0010_m6_moments";
import { migration0011M7Opportunities } from "./0011_m7_opportunities";
import { migration0012M7PlayerExperience } from "./0012_m7_player_experience";
import { migration0013M8Battles } from "./0013_m8_battles";
import { migration0014M85LivePerformances } from "./0014_m8_5_live_performances";
import { migration0015M9ComeUp } from "./0015_m9_come_up";

export type Migration = { id: string; sql: string };

/** Ordered. Append-only — never edit a migration that has shipped. */
export const migrations: Migration[] = [
  migration0001Init,
  migration0002M11Hardening,
  migration0003M2CareerHq,
  migration0004M3Studio,
  migration0005M4Releases,
  migration0006M5Reception,
  migration0007M5ListenerSemantics,
  migration0008M6Relationships,
  migration0009M6Crew,
  migration0010M6Moments,
  migration0011M7Opportunities,
  migration0012M7PlayerExperience,
  migration0013M8Battles,
  migration0014M85LivePerformances,
  migration0015M9ComeUp,
];
