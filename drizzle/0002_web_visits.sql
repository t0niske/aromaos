CREATE TABLE "web_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"visit_id" integer NOT NULL,
	"page_id" integer,
	"name" text NOT NULL,
	"data" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"visit_id" integer NOT NULL,
	"pid" text NOT NULL,
	"path" text NOT NULL,
	"title" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"scroll" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"site" text NOT NULL,
	"sid" text NOT NULL,
	"vid" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ping_at" timestamp with time zone,
	"number" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'Прямой заход' NOT NULL,
	"referrer" text,
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"landing" text,
	"pages" integer DEFAULT 0 NOT NULL,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"events_count" integer DEFAULT 0 NOT NULL,
	"has_tel" boolean DEFAULT false NOT NULL,
	"has_wa" boolean DEFAULT false NOT NULL,
	"has_form" boolean DEFAULT false NOT NULL,
	"has_leave" boolean DEFAULT false NOT NULL,
	"ip" text,
	"user_agent" text,
	"device" text,
	"browser" text,
	"os" text,
	"screen" text,
	"lang" text,
	"tz" text,
	"touch" boolean DEFAULT false NOT NULL,
	"webdriver" boolean DEFAULT false NOT NULL,
	"ym" text,
	"kind" text DEFAULT 'human' NOT NULL,
	"reasons" text,
	"checked" boolean DEFAULT false NOT NULL,
	"lead_id" integer
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "visitor_id" text;--> statement-breakpoint
ALTER TABLE "web_events" ADD CONSTRAINT "web_events_visit_id_web_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."web_visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_events" ADD CONSTRAINT "web_events_page_id_web_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."web_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_pages" ADD CONSTRAINT "web_pages_visit_id_web_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."web_visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_visits" ADD CONSTRAINT "web_visits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_events_visit_idx" ON "web_events" USING btree ("visit_id","id");--> statement-breakpoint
CREATE INDEX "web_events_name_idx" ON "web_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "web_pages_visit_idx" ON "web_pages" USING btree ("visit_id","pid");--> statement-breakpoint
CREATE UNIQUE INDEX "web_visits_sid_uq" ON "web_visits" USING btree ("sid");--> statement-breakpoint
CREATE INDEX "web_visits_started_idx" ON "web_visits" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "web_visits_vid_idx" ON "web_visits" USING btree ("vid","started_at");--> statement-breakpoint
CREATE INDEX "web_visits_lead_idx" ON "web_visits" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "web_visits_ping_idx" ON "web_visits" USING btree ("last_ping_at");--> statement-breakpoint
CREATE INDEX "leads_visitor_idx" ON "leads" USING btree ("visitor_id");