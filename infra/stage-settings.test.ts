import { describe, expect, test } from "vitest";
import { stageSettings } from "./stage-settings.ts";

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
