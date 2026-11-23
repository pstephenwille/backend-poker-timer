import type { Me } from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "../db/database.ts";
import { users } from "../db/schema.ts";
import type { SessionEnv } from "../sessions/require-session.ts";

export function meRoutes(database: Database) {
  return new Hono<SessionEnv>().get("/", async (c) => {
    const { userId, isAdmin } = c.get("session");
    const [user] = await database
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) {
      throw new Error(`Session refers to missing user ${userId}`);
    }
    const me: Me = { ...user, isAdmin };
    return c.json(me);
  });
}
