ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "account" SET "issuer" = 'local:credential' WHERE "provider_id" = 'credential';--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "account" WHERE "issuer" IS NULL) THEN
    RAISE EXCEPTION 'Unable to infer a trusted issuer for every account. Backfill non-credential account issuers according to the Better Auth 1.7 upgrade guide before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "account"
    GROUP BY "issuer", "account_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Account identity collisions must be resolved before the Better Auth issuer index can be created.';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_unique" ON "account" USING btree ("issuer","account_id");
