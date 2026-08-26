ALTER TABLE "blog" ADD COLUMN "locales" text[] DEFAULT array['en']::text[] NOT NULL;--> statement-breakpoint
UPDATE "blog" AS "publication"
SET "locales" = (
	SELECT array_agg("configured"."locale" ORDER BY "configured"."locale")
	FROM (
		SELECT "publication"."locale"
		UNION
		SELECT "post"."locale"
		FROM "post"
		WHERE "post"."blog_id" = "publication"."id"
	) AS "configured"
);--> statement-breakpoint
ALTER TABLE "blog" ADD CONSTRAINT "blog_default_locale_check" CHECK (cardinality("blog"."locales") > 0 and "blog"."locale" = any("blog"."locales"));

-- Recovery keeps the original locale column untouched. To roll back before an
-- application release, drop blog_default_locale_check, then drop blog.locales.
