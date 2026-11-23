import type { Database } from "../db/database.ts";
import { HOME_GROUP_ID } from "../db/home-group.ts";
import { users } from "../db/schema.ts";

export async function insertTestUser(database: Database, name: string) {
  const [user] = await database
    .insert(users)
    .values({
      groupId: HOME_GROUP_ID,
      cognitoSub: `google_${name}`,
      email: `${name}@example.com`,
    })
    .returning();
  if (!user) {
    throw new Error(`Inserting test user ${name} returned no row`);
  }
  return user;
}
