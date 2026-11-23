import { describe, expect, test } from "vitest";
import { spaFallbackUri } from "./spa-fallback.ts";

describe("spaFallbackUri", () => {
  test("serves index.html for the root and client-side routes", () => {
    expect(spaFallbackUri("/")).toBe("/index.html");
    expect(spaFallbackUri("/some/page")).toBe("/index.html");
    expect(spaFallbackUri("/some/page/")).toBe("/index.html");
  });

  test("leaves file requests untouched", () => {
    expect(spaFallbackUri("/assets/app.3f2a.js")).toBe("/assets/app.3f2a.js");
    expect(spaFallbackUri("/favicon.ico")).toBe("/favicon.ico");
  });

  test("leaves API requests untouched", () => {
    expect(spaFallbackUri("/api")).toBe("/api");
    expect(spaFallbackUri("/api/leaderboard")).toBe("/api/leaderboard");
    expect(spaFallbackUri("/api/members/123")).toBe("/api/members/123");
  });

  test("treats paths that merely start with api as client-side routes", () => {
    expect(spaFallbackUri("/apiary")).toBe("/index.html");
  });

  test("stays self-contained so it can run as injected CloudFront code", () => {
    const injected = new Function(`return (${spaFallbackUri.toString()})`)();
    expect(injected("/some/page")).toBe("/index.html");
  });
});
