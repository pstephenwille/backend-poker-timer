import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { createDatabase } from "../db/database.ts";
import { runMigrations } from "../db/migrations.ts";

const POSTGRES_IMAGE = "postgres:18-alpine";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function startTestDatabase(project: TestProject) {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const databaseUrl = container.getConnectionUri();

  const database = createDatabase(databaseUrl);
  try {
    await runMigrations(database);
  } finally {
    await database.$client.end();
  }

  project.provide("databaseUrl", databaseUrl);
  return async () => {
    await container.stop();
  };
}
