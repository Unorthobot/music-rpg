import { migration0001Init } from "./0001_init";
import { migration0002M11Hardening } from "./0002_m11_hardening";
import { migration0003M2CareerHq } from "./0003_m2_career_hq";
import { migration0004M3Studio } from "./0004_m3_studio";
import { migration0005M4Releases } from "./0005_m4_releases";
import { migration0006M5Reception } from "./0006_m5_reception";
import { migration0007M5ListenerSemantics } from "./0007_m5_listener_semantics";
import { migration0008M6Relationships } from "./0008_m6_relationships";
import { migration0009M6Crew } from "./0009_m6_crew";

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
];
