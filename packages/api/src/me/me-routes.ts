import { type Me, UpdateMe } from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "../db/database.ts";
import { isUniqueViolation } from "../db/postgres-errors.ts";
import { users } from "../db/schema.ts";
import { ApiError } from "../http/api-error.ts";
import { validate } from "../http/validate.ts";
import type { SessionEnv } from "../sessions/require-session.ts";
import type { SessionPrincipal } from "../sessions/session-store.ts";
import { resolveDisplayName } from "../users/display-name.ts";
import { type ProfileRow, profileColumns } from "../users/user-profile.ts";

const USERNAME_UNIQUE_CONSTRAINT = "users_username_lower_unique";

function toMe(row: ProfileRow, { isAdmin }: SessionPrincipal): Me {
  return {
    id: row.id,
    email: row.email,
    isAdmin,
    username: row.username,
    displayName: resolveDisplayName(row),
    avatarUrl: row.googleAvatarUrl,
  };
}

function requireUser(row: ProfileRow | undefined, userId: string): ProfileRow {
  if (!row) {
    throw new Error(`Session refers to missing user ${userId}`);
  }
  return row;
}

export function meRoutes(database: Database) {
  async function setUsername(userId: string, username: string | null) {
    try {
      const [row] = await database
        .update(users)
        .set({ username })
        .where(eq(users.id, userId))
        .returning(profileColumns);
      return requireUser(row, userId);
    } catch (error) {
      if (isUniqueViolation(error, USERNAME_UNIQUE_CONSTRAINT)) {
        throw new ApiError(
          409,
          "username_taken",
          `The username ${username} is already taken`,
        );
      }
      throw error;
    }
  }

  return new Hono<SessionEnv>()
    .get("/", async (c) => {
      const session = c.get("session");
      const [row] = await database
        .select(profileColumns)
        .from(users)
        .where(eq(users.id, session.userId));
      return c.json(toMe(requireUser(row, session.userId), session));
    })
    .patch("/", validate("json", UpdateMe), async (c) => {
      const session = c.get("session");
      const { username } = c.req.valid("json");
      const row = await setUsername(session.userId, username);
      return c.json(toMe(row, session));
    });
}
