import {
  ErrorEnvelope,
  MemberProfile,
  Members,
} from "@pstephenwille/poker-timer-contracts";
import { describe, expect, test } from "vitest";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";
import { insertTestUser } from "../testing/test-users.ts";

const database = useTestDatabase();
const app = createTestApp(database);

describe("GET /api/members", () => {
  test("lists every member, including deactivated ones, by display name", async () => {
    const { user: ann, headers } = await signInTestUser(database, "ann");
    const bob = await insertTestUser(database, "bob", {
      googleName: "Bob Jones",
      googleAvatarUrl: "https://lh3.googleusercontent.com/a/bob",
    });
    const cal = await insertTestUser(database, "cal", {
      deactivatedAt: new Date(),
    });

    const response = await app.request("/api/members", { headers });

    expect(response.status).toBe(200);
    expect(Members.parse(await response.json())).toEqual([
      { id: ann.id, displayName: "ann", avatarUrl: null, active: true },
      {
        id: bob.id,
        displayName: "Bob Jones",
        avatarUrl: "https://lh3.googleusercontent.com/a/bob",
        active: true,
      },
      { id: cal.id, displayName: "cal", avatarUrl: null, active: false },
    ]);
  });

  test("includes no email address, not even the reader's own", async () => {
    const { headers } = await signInTestUser(database, "ann");
    await insertTestUser(database, "bob");

    const response = await app.request("/api/members", { headers });

    expect(await response.text()).not.toContain("@example.com");
  });
});

describe("GET /api/members/{id}", () => {
  test("returns another member's profile without their email", async () => {
    const { headers } = await signInTestUser(database, "ann");
    const bob = await insertTestUser(database, "bob", {
      username: "Bob.Bluff",
    });

    const response = await app.request(`/api/members/${bob.id}`, { headers });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain("@example.com");
    expect(MemberProfile.parse(JSON.parse(text))).toEqual({
      id: bob.id,
      displayName: "Bob.Bluff",
      username: "Bob.Bluff",
      avatarUrl: null,
      active: true,
    });
  });

  test("answers 404 for an unknown member", async () => {
    const { headers } = await signInTestUser(database, "ann");

    const response = await app.request(
      "/api/members/0b7e3f1a-2c4d-4e6f-8a9b-1c2d3e4f5a6b",
      { headers },
    );

    expect(response.status).toBe(404);
    expect(ErrorEnvelope.parse(await response.json()).error.code).toBe(
      "member_not_found",
    );
  });

  test("answers 400 for an id that is not a UUID", async () => {
    const { headers } = await signInTestUser(database, "ann");

    const response = await app.request("/api/members/not-a-uuid", {
      headers,
    });

    expect(response.status).toBe(400);
  });
});
