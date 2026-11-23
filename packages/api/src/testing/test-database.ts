import { sql } from "drizzle-orm";
import { afterAll, beforeEach, inject } from "vitest";
import { createDatabase, type Database } from "../db/database.ts";

const SEEDED_TABLES = ["groups", "__drizzle_migrations"];

async function truncateUnseededTables(database: Database): Promise<void> {
  const result = await database.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const tables = result.rows
    .map((row) => row.tablename)
    .filter((table) => !SEEDED_TABLES.includes(table));
  if (tables.length === 0) {
    return;
  }
  const tableList = tables.map((table) => `"${table}"`).join(", ");
  await database.execute(sql.raw(`truncate ${tableList} cascade`));
}

/**
 * Connects to the Testcontainers Postgres started in global setup and gives every test
 * empty tables, keeping only the seeded group.
 */
export function useTestDatabase(): Database {
  const database = createDatabase(inject("databaseUrl"));
  beforeEach(() => truncateUnseededTables(database));
  afterAll(() => database.$client.end());
  return database;
}
