import { describe, expect, test } from "vitest";
import type { ZodType } from "zod";
import * as fixtures from "./fixtures.ts";
import { Leaderboard, Me } from "./index.ts";

type FixtureName = keyof typeof fixtures;

/** Typed by fixture name, so adding a fixture without registering its schema fails to compile. */
const schemaByFixture: Record<FixtureName, ZodType> = {
  leaderboard: Leaderboard,
  me: Me,
};

const fixtureEntries = Object.entries(fixtures) as [FixtureName, unknown][];

describe("fixtures", () => {
  test.each(fixtureEntries)("%s satisfies its schema", (name, fixture) => {
    const result = schemaByFixture[name].safeParse(fixture);

    expect(result.error?.issues).toBeUndefined();
  });
});
