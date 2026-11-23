import { eq, sql } from "drizzle-orm";
import { describe, expect, inject, test } from "vitest";
import { useTestDatabase } from "../testing/test-database.ts";
import { createDatabase } from "./database.ts";
import { HOME_GROUP_ID } from "./home-group.ts";
import { runMigrations } from "./migrations.ts";
import { groups, users } from "./schema.ts";

const database = useTestDatabase();

function insertUser(values: { cognitoSub: string; username?: string | null }) {
  return database
    .insert(users)
    .values({
      groupId: HOME_GROUP_ID,
      email: `${values.cognitoSub}@example.com`,
      ...values,
    })
    .returning();
}

describe("database", () => {
  test("round-trips a row", async () => {
    const [inserted] = await insertUser({ cognitoSub: "google_1" });

    const [read] = await database
      .select()
      .from(users)
      .where(eq(users.cognitoSub, "google_1"));

    expect(read).toEqual(inserted);
  });

  test("migrations seed the single home group", async () => {
    expect(await database.select().from(groups)).toEqual([
      { id: HOME_GROUP_ID, name: "Home game" },
    ]);
  });

  test("migrating an already migrated database changes nothing", async () => {
    const countMigrations = async () =>
      (
        await database.execute(
          sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
        )
      ).rows[0];
    const before = await countMigrations();

    const secondConnection = createDatabase(inject("databaseUrl"));
    await runMigrations(secondConnection);
    await secondConnection.$client.end();

    expect(await countMigrations()).toEqual(before);
    expect(await database.select().from(groups)).toHaveLength(1);
  });
});

describe("users table", () => {
  test("rejects usernames that differ only in letter case", async () => {
    await insertUser({ cognitoSub: "google_1", username: "Mike.AllIn" });

    await expect(
      insertUser({ cognitoSub: "google_2", username: "mike.allin" }),
    ).rejects.toThrow();
  });

  test("treats periods as significant", async () => {
    await insertUser({ cognitoSub: "google_1", username: "mike.allin" });

    await expect(
      insertUser({ cognitoSub: "google_2", username: "mikeallin" }),
    ).resolves.toHaveLength(1);
  });

  test.each([
    "short",
    "a".repeat(31),
    ".leading",
    "trailing.",
    "double..dot",
    "under_score",
  ])("rejects the malformed username %s", async (username) => {
    await expect(
      insertUser({ cognitoSub: "google_1", username }),
    ).rejects.toThrow();
  });

  test("allows users without a username", async () => {
    await expect(
      insertUser({ cognitoSub: "google_1", username: null }),
    ).resolves.toHaveLength(1);
  });
});
