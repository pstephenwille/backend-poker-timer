import { users } from "../db/schema.ts";
import { resolveDisplayName } from "./display-name.ts";

/** The columns every profile-shaped response is built from; email is only ever sent to its owner. */
export const profileColumns = {
  id: users.id,
  email: users.email,
  username: users.username,
  googleName: users.googleName,
  googleAvatarUrl: users.googleAvatarUrl,
  avatarMediaId: users.avatarMediaId,
  deactivatedAt: users.deactivatedAt,
};

export interface ProfileRow {
  id: string;
  email: string;
  username: string | null;
  googleName: string | null;
  googleAvatarUrl: string | null;
  avatarMediaId: string | null;
  deactivatedAt: Date | null;
}

export interface PublicProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  active: boolean;
}

/** The avatar URL is resolved separately because an uploaded avatar needs a signed URL. */
export function toPublicProfile(
  row: ProfileRow,
  avatarUrl: string | null,
): PublicProfile {
  return {
    id: row.id,
    displayName: resolveDisplayName(row),
    avatarUrl,
    active: row.deactivatedAt === null,
  };
}

export function byDisplayName(
  first: { displayName: string },
  second: { displayName: string },
): number {
  return first.displayName.localeCompare(second.displayName, "en", {
    sensitivity: "base",
  });
}
