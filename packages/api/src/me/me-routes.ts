import { UpdateMe } from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "../db/database.ts";
import { isUniqueViolation } from "../db/postgres-errors.ts";
import { users } from "../db/schema.ts";
import { ApiError } from "../http/api-error.ts";
import { validate } from "../http/validate.ts";
import type { SessionEnv } from "../sessions/require-session.ts";
import type { AvatarUrls } from "../users/avatar-urls.ts";
import { profileColumns } from "../users/user-profile.ts";
import { loadMe, requireUser, toMe } from "./me-view.ts";

const USERNAME_UNIQUE_CONSTRAINT = "users_username_lower_unique";

export function meRoutes(database: Database, avatarUrls: AvatarUrls) {
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
      return c.json(await loadMe(database, c.get("session"), avatarUrls));
    })
    .patch("/", validate("json", UpdateMe), async (c) => {
      const session = c.get("session");
      const { username } = c.req.valid("json");
      const row = await setUsername(session.userId, username);
      return c.json(await toMe(row, session, avatarUrls));
    });
}
