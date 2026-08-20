CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"inviter_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "blog" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "updated_by_id" text;--> statement-breakpoint
INSERT INTO "organization" ("id", "name", "slug", "created_at")
SELECT 'org_' || replace("id"::text, '-', ''), "name", "slug", "created_at"
FROM "blog";--> statement-breakpoint
UPDATE "blog"
SET "organization_id" = 'org_' || replace("id"::text, '-', '');--> statement-breakpoint
INSERT INTO "member" ("id", "organization_id", "user_id", "role", "created_at")
SELECT
	'mem_' || md5("blog_id"::text || ':' || "user_id"),
	'org_' || replace("blog_id"::text, '-', ''),
	"user_id",
	"role",
	"created_at"
FROM "blog_member";--> statement-breakpoint
UPDATE "post" AS p
SET
	"created_by_id" = a."user_id",
	"updated_by_id" = a."user_id"
FROM "author" AS a
WHERE p."author_id" = a."id" AND a."user_id" IS NOT NULL;--> statement-breakpoint
UPDATE "audit_log" AS audit
SET "organization_id" = blog."organization_id"
FROM "blog" AS blog
WHERE audit."blog_id" = blog."id";--> statement-breakpoint
UPDATE "session" AS session
SET "active_organization_id" = (
	SELECT member."organization_id"
	FROM "member"
	WHERE member."user_id" = session."user_id"
	ORDER BY member."created_at"
	LIMIT 1
)
WHERE EXISTS (
	SELECT 1 FROM "member" WHERE member."user_id" = session."user_id"
);--> statement-breakpoint
ALTER TABLE "blog" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_organization_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_user_unique" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog" ADD CONSTRAINT "blog_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
