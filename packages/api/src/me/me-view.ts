import type { Me } from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import type { Database } from "../db/database.ts";
import { users } from "../db/schema.ts";
import type { SessionPrincipal } from "../sessions/session-store.ts";
import type { AvatarUrls } from "../users/avatar-urls.ts";
import { resolveDisplayName } from "../users/display-name.ts";
import { type ProfileRow, profileColumns } from "../users/user-profile.ts";

export function requireUser(
  row: ProfileRow | undefined,
  userId: string,
): ProfileRow {
  if (!row) {
    throw new Error(`Session refers to missing user ${userId}`);
  }
  return row;
}

export async function toMe(
  row: ProfileRow,
  { isAdmin }: SessionPrincipal,
  avatarUrls: AvatarUrls,
): Promise<Me> {
  return {
    id: row.id,
    email: row.email,
    isAdmin,
    username: row.username,
    displayName: resolveDisplayName(row),
    avatarUrl: await avatarUrls.forRow(row),
  };
}

export async function loadMe(
  database: Database,
  session: SessionPrincipal,
  avatarUrls: AvatarUrls,
): Promise<Me> {
  const [row] = await database
    .select(profileColumns)
    .from(users)
    .where(eq(users.id, session.userId));
  return toMe(requireUser(row, session.userId), session, avatarUrls);
}
