import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { migrations } from "./migrations";

export type Schema = typeof schema;

/**
 * The database handle used by every command and query.
 *
 * The first generic is loose on purpose: the same code runs on the PGlite
 * driver (local dev and tests) and the postgres-js driver (hosted Postgres),
 * whose result HKTs differ. Everything below this alias stays fully typed.
 */
export type Database = PgDatabase<any, Schema, ExtractTablesWithRelations<Schema>>;

export type Transaction = PgTransaction<
  PgQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;

/**
 * Commands accept either the pooled handle or an open transaction, so a command
 * can be called standalone or composed inside a larger unit of work.
 */
export type DbClient = Database | Transaction;

export type DatabaseHandle = {
  db: Database;
  driver: "pglite" | "postgres";
  /** Runs multi-statement DDL. Driver-specific, hence not on `db`. */
  execRaw: (sql: string) => Promise<void>;
  close: () => Promise<void>;
};

export type CreateDatabaseOptions = {
  /** Postgres connection string. When omitted, embedded PGlite is used. */
  url?: string | undefined;
  /** PGlite data directory. Pass "memory://" for a throwaway database. */
  dataDir?: string | undefined;
};

/**
 * Creates a database handle.
 *
 * Driver choice is environment-driven, never code-driven: set DATABASE_URL and
 * the same schema, migrations and commands run against hosted Postgres.
 */
export async function createDatabase(
  options: CreateDatabaseOptions = {},
): Promise<DatabaseHandle> {
  const url = options.url ?? process.env.DATABASE_URL;

  if (url) {
    const [{ drizzle }, postgresModule] = await Promise.all([
      import("drizzle-orm/postgres-js"),
      import("postgres"),
    ]);
    const postgres = postgresModule.default;
    const client = postgres(url, { max: 5, prepare: false });
    const db = drizzle(client, { schema }) as unknown as Database;

    return {
      db,
      driver: "postgres",
      execRaw: async (sql: string) => {
        await client.unsafe(sql);
      },
      close: async () => {
        await client.end({ timeout: 5 });
      },
    };
  }

  const [{ PGlite }, { drizzle }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
  ]);

  // "memory://" gives a throwaway database — what tests use.
  const dataDir = options.dataDir ?? process.env.PGLITE_DATA_DIR ?? ".pglite/dev";

  if (!dataDir.includes("://")) {
    // PGlite creates the leaf directory but not its parents.
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }

  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema }) as unknown as Database;

  return {
    db,
    driver: "pglite",
    execRaw: async (sql: string) => {
      await client.exec(sql);
    },
    close: async () => {
      await client.close();
    },
  };
}

/**
 * Applies pending migrations. Idempotent: applied ids are recorded in
 * `_migrations`, and the DDL itself is `IF NOT EXISTS` throughout.
 */
export async function runMigrations(handle: DatabaseHandle): Promise<string[]> {
  await handle.execRaw(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set<string>();
  const result = await handle.db.execute(sql`SELECT id FROM _migrations`);
  // postgres-js resolves to an array, PGlite to `{ rows }`.
  const rows: { id: string }[] = Array.isArray(result)
    ? (result as { id: string }[])
    : ((result as { rows?: { id: string }[] }).rows ?? []);
  for (const row of rows) applied.add(row.id);

  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await handle.execRaw(migration.sql);
    await handle.execRaw(
      `INSERT INTO _migrations (id) VALUES ('${migration.id}') ON CONFLICT DO NOTHING;`,
    );
    ran.push(migration.id);
  }

  return ran;
}

declare global {
  // eslint-disable-next-line no-var
  var __musicRpgDb: Promise<DatabaseHandle> | undefined;
}

/**
 * Process-wide handle. Cached on `globalThis` so Next's dev server does not
 * open a new PGlite instance on every hot reload.
 */
export function getDatabase(): Promise<DatabaseHandle> {
  if (!globalThis.__musicRpgDb) {
    globalThis.__musicRpgDb = (async () => {
      const handle = await createDatabase();
      await runMigrations(handle);
      return handle;
    })();
  }
  return globalThis.__musicRpgDb;
}

export async function getDb(): Promise<Database> {
  return (await getDatabase()).db;
}
