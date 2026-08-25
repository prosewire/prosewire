CREATE TABLE "email_delivery_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"html" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_delivery_outbox_pending_idx" ON "email_delivery_outbox" USING btree ("dispatched_at","available_at","locked_at","created_at");