import type { IdentityClaims } from "../auth/identity-provider.ts";
import type { Database } from "../db/database.ts";
import { HOME_GROUP_ID } from "../db/home-group.ts";
import { users } from "../db/schema.ts";

export interface ProvisionedUser {
  id: string;
  deactivatedAt: Date | null;
}

/**
 * A single upsert keyed on the identity's subject, so concurrent first sign-ins
 * from two browsers still end with exactly one account, and later sign-ins
 * refresh the Google profile values.
 */
export async function provisionUser(
  database: Database,
  claims: IdentityClaims,
): Promise<ProvisionedUser> {
  const googleProfile = {
    email: claims.email,
    googleName: claims.name,
    googleAvatarUrl: claims.picture,
  };
  const [user] = await database
    .insert(users)
    .values({
      groupId: HOME_GROUP_ID,
      cognitoSub: claims.subject,
      ...googleProfile,
    })
    .onConflictDoUpdate({ target: users.cognitoSub, set: googleProfile })
    .returning({ id: users.id, deactivatedAt: users.deactivatedAt });
  if (!user) {
    throw new Error(`Upserting the user for ${claims.subject} returned no row`);
  }
  return user;
}
