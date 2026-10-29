CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_link_code" text;