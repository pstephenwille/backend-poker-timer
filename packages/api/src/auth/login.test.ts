import { describe, expect, test } from "vitest";
import { systemClock } from "../clock.ts";
import { createDatabase } from "../db/database.ts";
import { FakeIdentityProvider } from "../testing/fake-identity-provider.ts";
import { createTestApp, TEST_SIGNIN_COOKIE_KEY } from "../testing/test-app.ts";
import { createSigninCookieSealer, SIGNIN_COOKIE } from "./signin-cookie.ts";

/** Sign-in start never queries, so no running database is needed. */
const UNUSED_DATABASE_URL = "postgres://unused.invalid/unused";

const app = createTestApp(createDatabase(UNUSED_DATABASE_URL), {
  identityProvider: new FakeIdentityProvider(),
});
const signinCookies = createSigninCookieSealer(
  TEST_SIGNIN_COOKIE_KEY,
  systemClock,
);

async function startSignin(returnTo?: string) {
  const query =
    returnTo === undefined ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;
  const response = await app.request(`/api/auth/login${query}`);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const sealed = setCookie.match(new RegExp(`^${SIGNIN_COOKIE}=([^;]+)`))?.[1];
  return { response, setCookie, opened: signinCookies.open(sealed) };
}

function openedPayload(opened: ReturnType<typeof signinCookies.open>) {
  if (!opened.ok) {
    throw new Error(`Sign-in cookie did not open: ${opened.reason}`);
  }
  return opened.payload;
}

describe("GET /api/auth/login", () => {
  test("redirects to the identity provider without a session", async () => {
    const { response } = await startSignin();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/identity-provider\.test\/authorize\?/,
    );
  });

  test("binds the redirect's state to the sign-in cookie", async () => {
    const { response, opened } = await startSignin();
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("state")).toBe(
      openedPayload(opened).state,
    );
  });

  test("sets a short-lived, script-unreadable cookie scoped to the auth routes", async () => {
    const { setCookie } = await startSignin();
    const attributes = setCookie.split(";").map((part) => part.trim());

    expect(attributes).toEqual(
      expect.arrayContaining([
        "Max-Age=600",
        "Path=/api/auth",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
      ]),
    );
    expect(setCookie).not.toMatch(/Domain=/i);
  });

  test("remembers a relative returnTo", async () => {
    const { opened } = await startSignin("/tournaments/42");

    expect(openedPayload(opened).returnTo).toBe("/tournaments/42");
  });

  test("replaces an off-site returnTo with the app root", async () => {
    const { opened } = await startSignin("https://evil.example");

    expect(openedPayload(opened).returnTo).toBe("/");
  });

  test("forbids caching the redirect", async () => {
    const { response } = await startSignin();

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
