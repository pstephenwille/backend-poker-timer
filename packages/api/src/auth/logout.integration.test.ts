import { Logout } from "@pstephenwille/poker-timer-contracts";
import { describe, expect, test } from "vitest";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";

const database = useTestDatabase();
const app = createTestApp(database);

function logout(headers: Record<string, string>) {
  return app.request("/api/auth/logout", { method: "POST", headers });
}

describe("POST /api/auth/logout", () => {
  test("returns the identity provider's sign-out URL", async () => {
    const { headers } = await signInTestUser(database, "ann");

    const response = await logout(headers);

    expect(response.status).toBe(200);
    expect(Logout.parse(await response.json()).signOutUrl).toBe(
      "https://identity-provider.test/logout",
    );
  });

  test("expires the session cookie", async () => {
    const { headers } = await signInTestUser(database, "ann");

    const response = await logout(headers);
    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("__Host-session="));

    expect(sessionCookie).toMatch(/Max-Age=0/);
    expect(sessionCookie).toMatch(/Path=\//);
  });

  test("the old session cookie is rejected afterwards", async () => {
    const { headers } = await signInTestUser(database, "ann");
    await logout(headers);

    const response = await app.request("/api/me", { headers });

    expect(response.status).toBe(401);
  });

  test("ends only the signed-out session", async () => {
    const laptop = await signInTestUser(database, "ann");
    const bob = await signInTestUser(database, "bob");

    await logout(laptop.headers);

    expect((await app.request("/api/me", bob)).status).toBe(200);
  });
});
