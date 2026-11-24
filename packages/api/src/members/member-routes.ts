import type {
  MemberProfile,
  Members,
} from "@pstephenwille/poker-timer-contracts";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "../db/database.ts";
import { HOME_GROUP_ID } from "../db/home-group.ts";
import { users } from "../db/schema.ts";
import { ApiError } from "../http/api-error.ts";
import { validate } from "../http/validate.ts";
import type { SessionEnv } from "../sessions/require-session.ts";
import {
  byDisplayName,
  profileColumns,
  toPublicProfile,
} from "../users/user-profile.ts";

const MemberIdParam = z.object({ id: z.uuid() });

export function memberRoutes(database: Database) {
  return new Hono<SessionEnv>()
    .get("/", async (c) => {
      const rows = await database
        .select(profileColumns)
        .from(users)
        .where(eq(users.groupId, HOME_GROUP_ID));
      const members: Members = rows.map(toPublicProfile).sort(byDisplayName);
      return c.json(members);
    })
    .get("/:id", validate("param", MemberIdParam), async (c) => {
      const { id } = c.req.valid("param");
      const [row] = await database
        .select(profileColumns)
        .from(users)
        .where(and(eq(users.id, id), eq(users.groupId, HOME_GROUP_ID)));
      if (!row) {
        throw new ApiError(404, "member_not_found", `No member with id ${id}`);
      }
      const profile: MemberProfile = {
        ...toPublicProfile(row),
        username: row.username,
      };
      return c.json(profile);
    });
}
