CREATE UNIQUE INDEX "account_provider_account_id_unique" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
DROP INDEX "account_issuer_account_id_unique";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;
