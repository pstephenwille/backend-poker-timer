import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./database.ts";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

export async function runMigrations(database: Database): Promise<void> {
  await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
}
