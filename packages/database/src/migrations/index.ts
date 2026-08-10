import { migration0001Init } from "./0001_init";
import { migration0002M11Hardening } from "./0002_m11_hardening";

export type Migration = { id: string; sql: string };

/** Ordered. Append-only — never edit a migration that has shipped. */
export const migrations: Migration[] = [migration0001Init, migration0002M11Hardening];
