CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"cognito_sub" text NOT NULL,
	"email" text NOT NULL,
	"google_name" text,
	"google_avatar_url" text,
	"username" text,
	"username_lower" text GENERATED ALWAYS AS (lower("username")) STORED,
	"avatar_media_id" uuid,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_cognito_sub_unique" UNIQUE("cognito_sub"),
	CONSTRAINT "users_username_lower_unique" UNIQUE("username_lower"),
	CONSTRAINT "users_username_format" CHECK ("users"."username" is null or (char_length("users"."username") between 6 and 30 and "users"."username" ~ '^[A-Za-z0-9]+(\.[A-Za-z0-9]+)*$'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "groups" ("id", "name") VALUES ('00000000-0000-4000-8000-000000000001', 'Home game');
