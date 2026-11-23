import { Me } from "@pstephenwille/poker-timer-contracts";
import { describe, expect, test } from "vitest";
import { sessions } from "../db/schema.ts";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";

const database = useTestDatabase();
const app = createTestApp(database);

describe("GET /api/me", () => {
  test("returns the signed-in user including their own email", async () => {
    const { user, headers } = await signInTestUser(database, "ann");

    const response = await app.request("/api/me", { headers });

    expect(response.status).toBe(200);
    expect(Me.parse(await response.json())).toEqual({
      id: user.id,
      email: "ann@example.com",
      isAdmin: false,
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

describe("cross-site writes", () => {
  test("are rejected with 403 even with a valid session", async () => {
    const { headers } = await signInTestUser(database, "ann");

    const response = await app.request("/api/me", {
      method: "POST",
      headers: {
        ...headers,
        origin: "https://other.example",
        "content-type": "application/json",
      },
      body: "{}",
    });

    expect(response.status).toBe(403);
  });
});
