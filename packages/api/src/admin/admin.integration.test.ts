import {
  ErrorEnvelope,
  Leaderboard,
  MemberSummary,
} from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { sessions, users } from "../db/schema.ts";
import {
  FakeIdentityProvider,
  FIXED_CLAIMS,
} from "../testing/fake-identity-provider.ts";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";

const UNKNOWN_ID = "0b7e3f1a-2c4d-4e6f-8a9b-1c2d3e4f5a6b";

const database = useTestDatabase();
const provider = new FakeIdentityProvider();
const app = createTestApp(database, { identityProvider: provider });

type SignedIn = Awaited<ReturnType<typeof signInTestUser>>;
let admin: SignedIn;
let member: SignedIn;

beforeEach(async () => {
  admin = await signInTestUser(database, "ann", { isAdmin: true });
  member = await signInTestUser(database, "bob");
});

function adminAction(
  action: "deactivate" | "reactivate",
  userId: string,
  as: SignedIn = admin,
) {
  return app.request(`/api/admin/users/${userId}/${action}`, {
    method: "POST",
    headers: as.headers,
  });
}

/** Completes a Google sign-in through the fake provider and returns where the browser lands. */
async function signInWithGoogle(): Promise<string> {
  const login = await app.request("/api/auth/login");
  const signinCookie = login.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("__Secure-signin="))
    ?.split(";")[0];
  const authorizationUrl = new URL(login.headers.get("location") ?? "");
  const callback = await app.request(
    `/api/auth/callback?${provider.approve(authorizationUrl)}`,
    { headers: { cookie: signinCookie ?? "" } },
  );
  return callback.headers.get("location") ?? "";
}

describe("POST /api/admin/users/{id}/deactivate", () => {
  test("a member who is not an admin is refused", async () => {
    const response = await adminAction("deactivate", admin.user.id, member);

    expect(response.status).toBe(403);
    expect(ErrorEnvelope.parse(await response.json()).error.code).toBe(
      "admin_only",
    );
  });

  test("marks the member inactive and ends all their sessions", async () => {
    const response = await adminAction("deactivate", member.user.id);

    expect(response.status).toBe(200);
    expect(MemberSummary.parse(await response.json())).toMatchObject({
      id: member.user.id,
      active: false,
    });
    expect(
      await database
        .select()
        .from(sessions)
        .where(eq(sessions.userId, member.user.id)),
    ).toHaveLength(0);
  });

  test("the deactivated member's next request answers 401", async () => {
    await adminAction("deactivate", member.user.id);

    const response = await app.request("/api/me", { headers: member.headers });

    expect(response.status).toBe(401);
  });

  test("the deactivated member keeps their place on the leaderboard", async () => {
    await adminAction("deactivate", member.user.id);

    const leaderboard = Leaderboard.parse(
      await (await app.request("/api/leaderboard")).json(),
    );

    expect(leaderboard.map((entry) => entry.userId)).toContain(member.user.id);
  });

  test("deactivating twice keeps the original date", async () => {
    await adminAction("deactivate", member.user.id);
    const [first] = await database
      .select({ deactivatedAt: users.deactivatedAt })
      .from(users)
      .where(eq(users.id, member.user.id));

    await adminAction("deactivate", member.user.id);
    const [second] = await database
      .select({ deactivatedAt: users.deactivatedAt })
      .from(users)
      .where(eq(users.id, member.user.id));

    expect(second?.deactivatedAt).toEqual(first?.deactivatedAt);
  });

  test("answers 404 for an unknown member", async () => {
    const response = await adminAction("deactivate", UNKNOWN_ID);

    expect(response.status).toBe(404);
  });
});

describe("POST /api/admin/users/{id}/reactivate", () => {
  test("a member who is not an admin is refused", async () => {
    const response = await adminAction("reactivate", member.user.id, member);

    expect(response.status).toBe(403);
  });

  test("a reactivated member can sign in again", async () => {
    expect(await signInWithGoogle()).toBe("/");
    const [googleUser] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.cognitoSub, FIXED_CLAIMS.subject));
    const googleUserId = googleUser?.id ?? "";

    await adminAction("deactivate", googleUserId);
    expect(await signInWithGoogle()).toMatch(
      /^\/\?signinError=deactivated&ref=/,
    );

    const response = await adminAction("reactivate", googleUserId);
    expect(MemberSummary.parse(await response.json()).active).toBe(true);
    expect(await signInWithGoogle()).toBe("/");
  });
});
