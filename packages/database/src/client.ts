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

/** Ids of migrations that have not been applied to this database. */
export async function pendingMigrations(handle: DatabaseHandle): Promise<string[]> {
  const applied = new Set<string>();

  try {
    const result = await handle.db.execute(sql`SELECT id FROM _migrations`);
    const rows: { id: string }[] = Array.isArray(result)
      ? (result as { id: string }[])
      : ((result as { rows?: { id: string }[] }).rows ?? []);
    for (const row of rows) applied.add(row.id);
  } catch {
    // No ledger yet: everything is pending.
    return migrations.map((migration) => migration.id);
  }

  return migrations.filter((migration) => !applied.has(migration.id)).map((migration) => migration.id);
}

export class SchemaNotReadyError extends Error {
  constructor(readonly pending: string[]) {
    super(
      `Database schema is out of date — pending migrations: ${pending.join(", ")}. ` +
        `Run "npm run db:migrate" as part of the deploy before starting the application.`,
    );
    this.name = "SchemaNotReadyError";
  }
}

/**
 * Fails fast when a hosted database has not been migrated.
 *
 * The application runtime never owns schema changes: two cold instances racing
 * a migration on an incoming request is exactly the failure mode this prevents.
 */
export async function assertSchemaReady(handle: DatabaseHandle): Promise<void> {
  const pending = await pendingMigrations(handle);
  if (pending.length > 0) throw new SchemaNotReadyError(pending);
}

/**
 * Whether this process is allowed to migrate on its own.
 *
 * Embedded PGlite is a development and test convenience — its "database" is a
 * directory this process owns, so bootstrapping it automatically is correct.
 * Hosted Postgres is shared infrastructure, so migration is a deploy step and
 * the runtime only verifies. `DB_ALLOW_RUNTIME_MIGRATION=true` overrides for
 * the rare case (a preview environment, a one-off script) that wants it.
 */
export function shouldBootstrapAtRuntime(
  driver: DatabaseHandle["driver"],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.DB_ALLOW_RUNTIME_MIGRATION === "true") return true;
  if (env.DB_ALLOW_RUNTIME_MIGRATION === "false") return false;
  return driver === "pglite";
}

declare global {
  // eslint-disable-next-line no-var
  var __musicRpgDb: Promise<DatabaseHandle> | undefined;
}

/**
 * Process-wide handle. Cached on `globalThis` so Next's dev server does not
 * open a new PGlite instance on every hot reload.
 *
 * Embedded databases migrate themselves here; hosted databases are verified and
 * refused if a deploy forgot to migrate them.
 */
export function getDatabase(): Promise<DatabaseHandle> {
  if (!globalThis.__musicRpgDb) {
    globalThis.__musicRpgDb = (async () => {
      const handle = await createDatabase();

      if (shouldBootstrapAtRuntime(handle.driver)) {
        await runMigrations(handle);
      } else {
        await assertSchemaReady(handle);
      }

      return handle;
    })().catch((error) => {
      // Don't cache a poisoned handle: the next request should retry.
      globalThis.__musicRpgDb = undefined;
      throw error;
    });
  }
  return globalThis.__musicRpgDb;
}

export async function getDb(): Promise<Database> {
  return (await getDatabase()).db;
}
