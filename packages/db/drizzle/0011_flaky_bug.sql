DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "post" p
		JOIN "author" a ON a."id" = p."author_id"
		WHERE a."blog_id" <> p."blog_id"
	) THEN
		RAISE EXCEPTION 'Cannot enforce publication relationships: post rows reference authors from another publication';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "post_category" pc
		JOIN "post" p ON p."id" = pc."post_id"
		JOIN "category" c ON c."id" = pc."category_id"
		WHERE c."blog_id" <> p."blog_id"
	) THEN
		RAISE EXCEPTION 'Cannot enforce publication relationships: post-category rows cross publication boundaries';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "author" ADD CONSTRAINT "author_id_blog_id_unique" UNIQUE("id","blog_id");
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_id_blog_id_unique" UNIQUE("id","blog_id");
--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_id_blog_id_unique" UNIQUE("id","blog_id");
--> statement-breakpoint
ALTER TABLE "post_category" ADD COLUMN "blog_id" uuid;
--> statement-breakpoint
UPDATE "post_category" pc
SET "blog_id" = p."blog_id"
FROM "post" p
WHERE p."id" = pc."post_id";
--> statement-breakpoint
CREATE FUNCTION "set_post_category_blog_id"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."blog_id" IS NULL THEN
		SELECT p."blog_id" INTO NEW."blog_id"
		FROM "post" p
		WHERE p."id" = NEW."post_id";
	END IF;
	RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "set_post_category_blog_id"
BEFORE INSERT OR UPDATE OF "post_id", "blog_id" ON "post_category"
FOR EACH ROW EXECUTE FUNCTION "set_post_category_blog_id"();
--> statement-breakpoint
ALTER TABLE "post_category" ALTER COLUMN "blog_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "post" DROP CONSTRAINT "post_author_id_author_id_fk";
--> statement-breakpoint
ALTER TABLE "post_category" DROP CONSTRAINT "post_category_post_id_post_id_fk";
--> statement-breakpoint
ALTER TABLE "post_category" DROP CONSTRAINT "post_category_category_id_category_id_fk";
--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_author_blog_fk" FOREIGN KEY ("author_id","blog_id") REFERENCES "public"."author"("id","blog_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_category" ADD CONSTRAINT "post_category_post_blog_fk" FOREIGN KEY ("post_id","blog_id") REFERENCES "public"."post"("id","blog_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_category" ADD CONSTRAINT "post_category_category_blog_fk" FOREIGN KEY ("category_id","blog_id") REFERENCES "public"."category"("id","blog_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "post_category_blog_category_idx" ON "post_category" USING btree ("blog_id","category_id");
