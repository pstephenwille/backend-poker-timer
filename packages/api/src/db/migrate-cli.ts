import { createDatabase } from "./database.ts";
import { runMigrations } from "./migrations.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set to the target stage's Neon connection string",
  );
}

const database = createDatabase(connectionString);
try {
  await runMigrations(database);
  console.log("Migrations applied");
} finally {
  await database.$client.end();
}
