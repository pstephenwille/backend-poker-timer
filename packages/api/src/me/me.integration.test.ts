import { ErrorEnvelope, Me } from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { sessions, users } from "../db/schema.ts";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";
import { insertTestUser } from "../testing/test-users.ts";

const database = useTestDatabase();
const app = createTestApp(database);

function updateMe(headers: Record<string, string>, body: unknown) {
  return app.request("/api/me", {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function storedUsername(userId: string) {
  const [row] = await database
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId));
  return row?.username;
}

describe("GET /api/me", () => {
  test("returns the signed-in user including their own email", async () => {
    const { user, headers } = await signInTestUser(database, "ann");

    const response = await app.request("/api/me", { headers });

    expect(response.status).toBe(200);
    expect(Me.parse(await response.json())).toEqual({
      id: user.id,
      email: "ann@example.com",
      isAdmin: false,
      username: null,
      displayName: "ann",
      avatarUrl: null,
    });
  });

  test("reports admin status captured on the session", async () => {
    const { headers } = await signInTestUser(database, "ann", {
      isAdmin: true,
    });

    const response = await app.request("/api/me", { headers });

    expect(Me.parse(await response.json()).isAdmin).toBe(true);
  });

  test("answers 401 once the session is gone", async () => {
    const { headers } = await signInTestUser(database, "ann");
    await database.delete(sessions);

    const response = await app.request("/api/me", { headers });

    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/me", () => {
  test("saves an available username with the casing entered", async () => {
    const { user, headers } = await signInTestUser(database, "ann");

    const response = await updateMe(headers, { username: "Mike.AllIn" });

    expect(response.status).toBe(200);
    expect(Me.parse(await response.json())).toMatchObject({
      username: "Mike.AllIn",
      displayName: "Mike.AllIn",
    });
    expect(await storedUsername(user.id)).toBe("Mike.AllIn");
  });

  test("answers 409 when another user holds the username in different case", async () => {
    await insertTestUser(database, "bob", { username: "Mike.AllIn" });
    const { user, headers } = await signInTestUser(database, "ann");

    const response = await updateMe(headers, { username: "mike.allin" });

    expect(response.status).toBe(409);
    expect(ErrorEnvelope.parse(await response.json()).error).toEqual({
      code: "username_taken",
      message: "The username mike.allin is already taken",
    });
    expect(await storedUsername(user.id)).toBeNull();
  });

  test("accepts a username that differs from a taken one only by periods", async () => {
    await insertTestUser(database, "bob", { username: "mike.allin" });
    const { headers } = await signInTestUser(database, "ann");

    const response = await updateMe(headers, { username: "mikeallin" });

    expect(response.status).toBe(200);
  });

  test("lets a user change the casing of their own username", async () => {
    const { headers } = await signInTestUser(database, "ann");
    await updateMe(headers, { username: "mike.allin" });

    const response = await updateMe(headers, { username: "Mike.AllIn" });

    expect(response.status).toBe(200);
  });

  test.each([
    ["too short", "mikej"],
    ["too long", "a".repeat(31)],
    ["containing an underscore", "mike_j"],
    ["with a leading period", ".mikej1"],
    ["with a trailing period", "mikej1."],
    ["with doubled periods", "mike..j"],
  ])(
    "answers 400 describing the format for a username %s",
    async (_rule, username) => {
      const { headers } = await signInTestUser(database, "ann");

      const response = await updateMe(headers, { username });
      const { error } = ErrorEnvelope.parse(await response.json());

      expect(response.status).toBe(400);
      expect(error.details?.[0]).toEqual({
        path: "username",
        message: expect.stringMatching(/6–30 letters, digits or periods/),
      });
    },
  );

  test("clearing the username falls back to the Google name", async () => {
    const { user, headers } = await signInTestUser(database, "ann");
    await database
      .update(users)
      .set({ googleName: "Ann Example" })
      .where(eq(users.id, user.id));
    await updateMe(headers, { username: "Ann.AllIn" });

    const response = await updateMe(headers, { username: null });

    expect(Me.parse(await response.json())).toMatchObject({
      username: null,
      displayName: "Ann Example",
    });
  });

  test("a fallback display name is never held to the username rules", async () => {
    const { headers } = await signInTestUser(database, "mike_j");

    const response = await app.request("/api/me", { headers });

    expect(Me.parse(await response.json()).displayName).toBe("mike_j");
  });
});
