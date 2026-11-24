import {
  HAND_CATEGORIES,
  MAX_NOTE_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "@pstephenwille/poker-timer-contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

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

export const sessions = pgTable("sessions", {
  idHash: bytea("id_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  isAdmin: boolean("is_admin").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});

/** Declared weakest to strongest, so Postgres orders the enum by hand strength. */
export const winningHand = pgEnum("winning_hand", HAND_CATEGORIES);

/**
 * Millisecond precision matches the epoch milliseconds the API exchanges, so a
 * pagination cursor built from these values compares exactly with the stored row.
 */
const millisecondTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3 });

export const tournaments = pgTable(
  "tournaments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    playedOn: millisecondTimestamp("played_on").notNull(),
    winnerId: uuid("winner_id")
      .notNull()
      .references(() => users.id),
    winningHand: winningHand("winning_hand").notNull(),
    pot: integer("pot").notNull(),
    note: varchar("note", { length: MAX_NOTE_LENGTH }),
    photoMediaId: uuid("photo_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    recordedById: uuid("recorded_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: millisecondTimestamp("created_at").notNull().defaultNow(),
    updatedAt: millisecondTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [check("tournaments_pot_non_negative", sql`${table.pot} >= 0`)],
);

export const tournamentParticipants = pgTable(
  "tournament_participants",
  {
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    isOpponent: boolean("is_opponent").notNull(),
  },
  (table) => [primaryKey({ columns: [table.tournamentId, table.userId] })],
);

export const mediaKind = pgEnum("media_kind", ["tournament_photo", "avatar"]);
export const mediaStatus = pgEnum("media_status", ["pending", "ready"]);

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),
  kind: mediaKind("kind").notNull(),
  uploadKey: text("upload_key").notNull(),
  displayKey: text("display_key"),
  status: mediaStatus("status").notNull().default("pending"),
  createdAt: millisecondTimestamp("created_at").notNull().defaultNow(),
});
