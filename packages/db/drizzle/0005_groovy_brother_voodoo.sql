DROP INDEX "post_search_idx";--> statement-breakpoint
ALTER TABLE "post_view" ADD COLUMN "event_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE INDEX "post_search_idx" ON "post" USING gin (to_tsvector('simple', "title" || ' ' || "excerpt" || ' ' || "content_markdown"));--> statement-breakpoint
ALTER TABLE "post_view" ADD CONSTRAINT "post_view_event_id_unique" UNIQUE("event_id");--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_role_check" CHECK ("invitation"."role" in ('owner', 'admin', 'editor', 'author', 'viewer', 'member'));--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_status_check" CHECK ("invitation"."status" in ('pending', 'accepted', 'rejected', 'canceled'));--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_role_check" CHECK ("member"."role" in ('owner', 'admin', 'editor', 'author', 'viewer', 'member'));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_check" CHECK ("user"."role" in ('admin', 'member'));--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_status_check" CHECK ("post"."status" in ('draft', 'scheduled', 'published', 'archived'));--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_status_timestamp_check" CHECK (("post"."status" <> 'scheduled' or "post"."scheduled_at" is not null) and ("post"."status" <> 'published' or "post"."published_at" is not null) and ("post"."status" <> 'archived' or "post"."archived_at" is not null));--> statement-breakpoint
ALTER TABLE "redirect" ADD CONSTRAINT "redirect_status_code_check" CHECK ("redirect"."status_code" in (301, 302, 307, 308));