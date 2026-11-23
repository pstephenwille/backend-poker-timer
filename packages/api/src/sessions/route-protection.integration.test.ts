import { describe, expect, test } from "vitest";
import {
  createTestApp,
  signInTestUser,
  TEST_APP_ORIGIN,
} from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";
import { SESSION_COOKIE } from "./require-session.ts";

/** Written out independently of the middleware so widening its public list fails this test. */
const EXPECTED_PUBLIC_ROUTES = [
  "GET /api/leaderboard",
  "GET /api/auth/login",
  "GET /api/auth/callback",
];
const MIDDLEWARE_METHOD = "ALL";
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
const PLACEHOLDER_ID = "6f1c2a9e-3b7d-4e8a-9c1f-2d5b8e7a4c31";

const database = useTestDatabase();
const app = createTestApp(database);

const registeredRoutes = app.routes
  .filter((route) => route.method !== MIDDLEWARE_METHOD)
  .map((route) => ({
    method: route.method,
    path: route.path.replace(/:\w+/g, PLACEHOLDER_ID),
    name: `${route.method} ${route.path}`,
  }));

/** Sends the app's origin and a JSON body, so only the session check can reject the request. */
function requestWithoutSession(method: string, path: string) {
  const hasBody = !SAFE_METHODS.includes(method);
  return app.request(path, {
    method,
    headers: {
      origin: TEST_APP_ORIGIN,
      ...(hasBody ? { "content-type": "application/json" } : {}),
    },
    ...(hasBody ? { body: "{}" } : {}),
  });
}

describe("route protection", () => {
  test("routes are registered", () => {
    expect(registeredRoutes.length).toBeGreaterThan(0);
  });

  test.each(registeredRoutes)(
    "$name answers 401 without a session unless public",
    async ({ method, path, name }) => {
      const response = await requestWithoutSession(method, path);

      if (EXPECTED_PUBLIC_ROUTES.includes(name)) {
        expect(response.status).not.toBe(401);
      } else {
        expect(response.status).toBe(401);
      }
    },
  );

  test("an unknown session cookie answers 401", async () => {
    const response = await app.request("/api/me", {
      headers: { cookie: `${SESSION_COOKIE}=not-a-session` },
    });

    expect(response.status).toBe(401);
  });

  test("unknown routes answer a JSON 404 once signed in", async () => {
    const { headers } = await signInTestUser(database, "ann");

    const response = await app.request("/api/does-not-exist", { headers });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "not_found",
        message: "No route for GET /api/does-not-exist",
      },
    });
  });
});
