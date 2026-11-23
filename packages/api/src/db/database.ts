import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";

export function createDatabase(connectionString: string) {
  return drizzle(new pg.Pool({ connectionString }), { schema });
}

export type Database = ReturnType<typeof createDatabase>;
