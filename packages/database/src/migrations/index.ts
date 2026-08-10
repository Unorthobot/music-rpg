import { migration0001Init } from "./0001_init";

export type Migration = { id: string; sql: string };

/** Ordered. Append-only. */
export const migrations: Migration[] = [migration0001Init];
