WITH "ranked_pending_invitations" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "organization_id", "email"
			ORDER BY "created_at" DESC, "id" DESC
		) AS "position"
	FROM "invitation"
	WHERE "status" = 'pending'
)
UPDATE "invitation"
SET "status" = 'canceled'
WHERE "id" IN (
	SELECT "id"
	FROM "ranked_pending_invitations"
	WHERE "position" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_pending_email_unique" ON "invitation" USING btree ("organization_id","email") WHERE "invitation"."status" = 'pending';
