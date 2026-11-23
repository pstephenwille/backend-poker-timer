import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const USERNAME_MIN_LENGTH = 6;
const USERNAME_MAX_LENGTH = 30;
const USERNAME_PATTERN = "^[A-Za-z0-9]+(\\.[A-Za-z0-9]+)*$";

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    cognitoSub: text("cognito_sub").notNull().unique(),
    email: text("email").notNull(),
    googleName: text("google_name"),
    googleAvatarUrl: text("google_avatar_url"),
    username: text("username"),
    usernameLower: text("username_lower")
      .generatedAlwaysAs(sql`lower("username")`)
      .unique(),
    avatarMediaId: uuid("avatar_media_id"),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "users_username_format",
      sql`${table.username} is null or (char_length(${table.username}) between ${sql.raw(String(USERNAME_MIN_LENGTH))} and ${sql.raw(String(USERNAME_MAX_LENGTH))} and ${table.username} ~ '${sql.raw(USERNAME_PATTERN)}')`,
    ),
  ],
);
