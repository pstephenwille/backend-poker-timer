import type { MemberSummary } from "@pstephenwille/poker-timer-contracts";
import { and, eq, type SQL, sql } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { Database } from "../db/database.ts";
import { HOME_GROUP_ID } from "../db/home-group.ts";
import { users } from "../db/schema.ts";
import { ApiError } from "../http/api-error.ts";
import { validate } from "../http/validate.ts";
import type { SessionEnv } from "../sessions/require-session.ts";
import type { SessionStore } from "../sessions/session-store.ts";
import type { AvatarUrls } from "../users/avatar-urls.ts";
import { profileColumns, toPublicProfile } from "../users/user-profile.ts";

const UserIdParam = z.object({ id: z.uuid() });

export interface AdminRouteDependencies {
  database: Database;
  sessionStore: SessionStore;
  avatarUrls: AvatarUrls;
}

const requireAdmin: MiddlewareHandler<SessionEnv> = async (c, next) => {
  if (!c.get("session").isAdmin) {
    throw new ApiError(403, "admin_only", "Only an admin can do this");
  }
  await next();
};

export function adminRoutes({
  database,
  sessionStore,
  avatarUrls,
}: AdminRouteDependencies) {
  async function setDeactivatedAt(
    userId: string,
    deactivatedAt: SQL | null,
  ): Promise<MemberSummary> {
    const [row] = await database
      .update(users)
      .set({ deactivatedAt })
      .where(and(eq(users.id, userId), eq(users.groupId, HOME_GROUP_ID)))
      .returning(profileColumns);
    if (!row) {
      throw new ApiError(
        404,
        "member_not_found",
        `No member with id ${userId}`,
      );
    }
    return toPublicProfile(row, await avatarUrls.forRow(row));
  }

  return new Hono<SessionEnv>()
    .use(requireAdmin)
    .post(
      "/users/:id/deactivate",
      validate("param", UserIdParam),
      async (c) => {
        const { id } = c.req.valid("param");
        const member = await setDeactivatedAt(
          id,
          sql`coalesce(${users.deactivatedAt}, now())`,
        );
        await sessionStore.removeAllForUser(id);
        return c.json(member);
      },
    )
    .post(
      "/users/:id/reactivate",
      validate("param", UserIdParam),
      async (c) => {
        const { id } = c.req.valid("param");
        return c.json(await setDeactivatedAt(id, null));
      },
    );
}
