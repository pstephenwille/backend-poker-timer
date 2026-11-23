import { Me } from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { sessions, users } from "../db/schema.ts";
import {
  FakeIdentityProvider,
  FIXED_CLAIMS,
} from "../testing/fake-identity-provider.ts";
import { createTestApp } from "../testing/test-app.ts";
import { TestClock } from "../testing/test-clock.ts";
import { useTestDatabase } from "../testing/test-database.ts";
import type { IdentityClaims } from "./identity-provider.ts";

const MINUTE_MS = 60 * 1000;
const SESSION_LIFETIME_SECONDS = 90 * 24 * 60 * 60;

const database = useTestDatabase();
let clock: TestClock;
let provider: FakeIdentityProvider;
let app: ReturnType<typeof createTestApp>;
let warnings: string[];

beforeEach(() => {
  clock = new TestClock();
  provider = new FakeIdentityProvider();
  app = createTestApp(database, { identityProvider: provider, clock });
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((message: string) => {
    warnings.push(message);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function cookieValue(response: Response, name: string): string | undefined {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(";")[0]
    ?.slice(name.length + 1);
}

function setCookieHeader(response: Response, name: string): string {
  const header = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${name}=`));
  if (!header) {
    throw new Error(`Response did not set ${name}`);
  }
  return header;
}

async function beginSignin(returnTo = "/tournaments") {
  const response = await app.request(
    `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
  );
  return {
    authorizationUrl: new URL(response.headers.get("location") ?? ""),
    signinCookie: cookieValue(response, "__Secure-signin") ?? "",
  };
}

function callback(params: URLSearchParams, signinCookie?: string) {
  return app.request(`/api/auth/callback?${params}`, {
    headers: signinCookie ? { cookie: `__Secure-signin=${signinCookie}` } : {},
  });
}

async function signInWith(claims: IdentityClaims = FIXED_CLAIMS) {
  const { authorizationUrl, signinCookie } = await beginSignin();
  return callback(provider.approve(authorizationUrl, claims), signinCookie);
}

async function readMe(response: Response) {
  const sessionId = cookieValue(response, "__Host-session");
  const me = await app.request("/api/me", {
    headers: { cookie: `__Host-session=${sessionId}` },
  });
  return {
    status: me.status,
    body: me.status === 200 ? Me.parse(await me.json()) : null,
  };
}

function failureRedirect(response: Response) {
  const location = new URL(
    response.headers.get("location") ?? "",
    "https://app.test",
  );
  return {
    status: response.status,
    path: location.pathname,
    params: Object.fromEntries(location.searchParams),
  };
}

async function sessionCount() {
  return (await database.select().from(sessions)).length;
}

describe("completing sign-in", () => {
  test("first sign-in creates the account, a session and returns to the app", async () => {
    const response = await signInWith();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/tournaments");
    const [user] = await database.select().from(users);
    expect(user).toMatchObject({
      cognitoSub: FIXED_CLAIMS.subject,
      email: FIXED_CLAIMS.email,
      googleName: FIXED_CLAIMS.name,
      googleAvatarUrl: FIXED_CLAIMS.picture,
    });
    expect(await readMe(response)).toEqual({
      status: 200,
      body: { id: user?.id, email: FIXED_CLAIMS.email, isAdmin: false },
    });
  });

  test("sets a strict, host-only, script-unreadable session cookie", async () => {
    const response = await signInWith();
    const attributes = setCookieHeader(response, "__Host-session")
      .split(";")
      .map((part) => part.trim());

    expect(attributes).toEqual(
      expect.arrayContaining([
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
        `Max-Age=${SESSION_LIFETIME_SECONDS}`,
      ]),
    );
    expect(attributes.some((part) => /^domain=/i.test(part))).toBe(false);
  });

  test("deletes the sign-in cookie", async () => {
    const response = await signInWith();

    expect(setCookieHeader(response, "__Secure-signin")).toMatch(/Max-Age=0/);
  });

  test("no identity-provider token appears in the response", async () => {
    const response = await signInWith();

    expect(await response.text()).not.toMatch(/eyJ|id_token|access_token/);
    expect(response.headers.get("location")).not.toMatch(/token|code=/);
  });

  test("a later sign-in refreshes the profile and issues a new session id", async () => {
    const first = await signInWith();
    const second = await signInWith({
      ...FIXED_CLAIMS,
      name: "Ann Renamed",
      email: "ann.new@example.com",
    });

    expect(cookieValue(second, "__Host-session")).not.toBe(
      cookieValue(first, "__Host-session"),
    );
    const allUsers = await database.select().from(users);
    expect(allUsers).toHaveLength(1);
    expect(allUsers[0]).toMatchObject({
      googleName: "Ann Renamed",
      email: "ann.new@example.com",
    });
  });

  test("concurrent first sign-ins of one identity create exactly one account", async () => {
    const laptop = await beginSignin();
    const phone = await beginSignin();

    const responses = await Promise.all([
      callback(provider.approve(laptop.authorizationUrl), laptop.signinCookie),
      callback(provider.approve(phone.authorizationUrl), phone.signinCookie),
    ]);

    expect(responses.map((response) => response.status)).toEqual([303, 303]);
    expect(await database.select().from(users)).toHaveLength(1);
    expect(await sessionCount()).toBe(2);
  });

  test("grants admin when the provider asserts the admin group", async () => {
    const response = await signInWith({ ...FIXED_CLAIMS, groups: ["admin"] });

    expect((await readMe(response)).body?.isAdmin).toBe(true);
  });

  test("deletes every user's expired sessions on sign-in", async () => {
    await signInWith({
      ...FIXED_CLAIMS,
      subject: "bob",
      email: "bob@example.com",
    });
    clock.advance(31 * 24 * 60 * MINUTE_MS);

    await signInWith();

    expect(await sessionCount()).toBe(1);
  });
});

describe("failed sign-in", () => {
  test("cancelling at the provider redirects with signinError=cancelled", async () => {
    const { authorizationUrl, signinCookie } = await beginSignin();

    const response = await callback(
      provider.deny(authorizationUrl),
      signinCookie,
    );

    expect(failureRedirect(response)).toMatchObject({
      status: 303,
      path: "/",
      params: { signinError: "cancelled" },
    });
  });

  test("a callback in a browser that never started sign-in is expired", async () => {
    const { authorizationUrl } = await beginSignin();

    const response = await callback(provider.approve(authorizationUrl));

    expect(failureRedirect(response).params.signinError).toBe("expired");
  });

  test("a sign-in cookie older than 10 minutes is expired", async () => {
    const { authorizationUrl, signinCookie } = await beginSignin();
    clock.advance(10 * MINUTE_MS + 1);

    const response = await callback(
      provider.approve(authorizationUrl),
      signinCookie,
    );

    expect(failureRedirect(response).params.signinError).toBe("expired");
  });

  test("replaying a completed callback is expired and creates no session", async () => {
    const { authorizationUrl, signinCookie } = await beginSignin();
    const callbackParams = provider.approve(authorizationUrl);
    await callback(callbackParams, signinCookie);

    const replay = await callback(callbackParams);

    expect(failureRedirect(replay).params.signinError).toBe("expired");
    expect(await sessionCount()).toBe(1);
  });

  test("a deactivated user is refused", async () => {
    await signInWith();
    await database
      .update(users)
      .set({ deactivatedAt: clock.now() })
      .where(eq(users.cognitoSub, FIXED_CLAIMS.subject));
    await database.delete(sessions);

    const response = await signInWith();

    expect(failureRedirect(response).params.signinError).toBe("deactivated");
    expect(await sessionCount()).toBe(0);
  });

  test("a state that does not match the sign-in cookie fails", async () => {
    const victim = await beginSignin();
    const attacker = await beginSignin();

    const response = await callback(
      provider.approve(attacker.authorizationUrl),
      victim.signinCookie,
    );

    expect(failureRedirect(response).params.signinError).toBe("failed");
  });

  test("a code the provider cannot verify fails", async () => {
    const { authorizationUrl, signinCookie } = await beginSignin();
    const forged = new URLSearchParams({
      code: "forged",
      state: authorizationUrl.searchParams.get("state") ?? "",
    });

    const response = await callback(forged, signinCookie);

    expect(failureRedirect(response).params.signinError).toBe("failed");
  });

  test("redirects with only the code and a ref, and logs the reason under that ref", async () => {
    const { authorizationUrl } = await beginSignin();

    const response = await callback(provider.approve(authorizationUrl));
    const { params } = failureRedirect(response);

    expect(Object.keys(params).sort()).toEqual(["ref", "signinError"]);
    const logged = warnings.map((warning) => JSON.parse(warning));
    expect(logged).toContainEqual({
      event: "signin_failed",
      ref: params.ref,
      code: "expired",
      reason: "Sign-in cookie missing",
    });
  });

  test("deletes the sign-in cookie and sets no session cookie", async () => {
    const { authorizationUrl, signinCookie } = await beginSignin();

    const response = await callback(
      provider.deny(authorizationUrl),
      signinCookie,
    );

    expect(setCookieHeader(response, "__Secure-signin")).toMatch(/Max-Age=0/);
    expect(cookieValue(response, "__Host-session")).toBeUndefined();
    expect(await sessionCount()).toBe(0);
  });
});
