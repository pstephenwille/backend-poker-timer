import { describe, expect, test } from "vitest";
import { localFrontendOrigin, stageSettings } from "./stage-settings.ts";

describe("stageSettings", () => {
  test("prod retains and protects its resources", () => {
    expect(stageSettings("prod")).toEqual({
      domain: undefined,
      removal: "retain",
      protect: true,
    });
  });

  test("dev retains its resources without protection", () => {
    expect(stageSettings("dev")).toEqual({
      domain: undefined,
      removal: "retain",
      protect: false,
    });
  });

  test("a personal stage removes its resources on teardown", () => {
    expect(stageSettings("stephen")).toEqual({
      domain: undefined,
      removal: "remove",
      protect: false,
    });
  });

  test("each stage gets its own host under the root domain", () => {
    expect(stageSettings("prod", "example.com").domain).toBe("example.com");
    expect(stageSettings("dev", "example.com").domain).toBe("dev.example.com");
    expect(stageSettings("stephen", "example.com").domain).toBe(
      "stephen.dev.example.com",
    );
  });
});

describe("localFrontendOrigin", () => {
  test("a personal stage serves the frontend on localhost when asked", () => {
    expect(localFrontendOrigin("stephen", "http://localhost:3333")).toBe(
      "http://localhost:3333",
    );
  });

  test("without a request, the stage serves its own frontend", () => {
    expect(localFrontendOrigin("stephen", undefined)).toBeUndefined();
    expect(localFrontendOrigin("stephen", "")).toBeUndefined();
  });

  test.each(["prod", "dev"])("%s refuses a local frontend", (stage) => {
    expect(() => localFrontendOrigin(stage, "http://localhost:3333")).toThrow(
      `LOCAL_FRONTEND_ORIGIN is only for personal stages; unset it to deploy ${stage}`,
    );
  });

  test.each([
    "https://localhost:3333",
    "http://evil.example:3333",
    "http://localhost:3333/",
    "http://localhost",
  ])("refuses %s, which is not http://localhost with a port", (origin) => {
    expect(() => localFrontendOrigin("stephen", origin)).toThrow(
      `LOCAL_FRONTEND_ORIGIN must look like http://localhost:3333, got ${origin}`,
    );
  });
});
