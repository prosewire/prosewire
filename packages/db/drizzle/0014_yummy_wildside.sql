CREATE TABLE "media_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blog_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"declared_mime_type" text NOT NULL,
	"detected_mime_type" text,
	"byte_size" bigint NOT NULL,
	"storage_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"checksum_sha256" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"upload_storage_key" text NOT NULL,
	"failure_reason" text,
	"created_by_id" text,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	"backed_up_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_asset_upload_storage_key_unique" UNIQUE("upload_storage_key"),
	CONSTRAINT "media_asset_id_blog_id_unique" UNIQUE("id","blog_id"),
	CONSTRAINT "media_asset_byte_size_check" CHECK ("media_asset"."byte_size" > 0),
	CONSTRAINT "media_asset_storage_bytes_check" CHECK ("media_asset"."storage_bytes" > 0),
	CONSTRAINT "media_asset_status_check" CHECK ("media_asset"."status" in ('pending', 'processing', 'ready', 'failed', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "media_variant" (
	"asset_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"public_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"checksum_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_variant_asset_id_kind_pk" PRIMARY KEY("asset_id","kind"),
	CONSTRAINT "media_variant_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_variant_kind_check" CHECK ("media_variant"."kind" in ('original', 'large', 'thumbnail')),
	CONSTRAINT "media_variant_byte_size_check" CHECK ("media_variant"."byte_size" > 0),
	CONSTRAINT "media_variant_dimensions_check" CHECK ("media_variant"."width" > 0 and "media_variant"."height" > 0)
);
--> statement-breakpoint
ALTER TABLE "blog" ADD COLUMN "media_storage_quota_bytes" bigint DEFAULT 1073741824 NOT NULL;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "cover_image_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "blog" ADD CONSTRAINT "blog_media_storage_quota_bytes_check" CHECK ("blog"."media_storage_quota_bytes" > 0);--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_blog_id_blog_id_fk" FOREIGN KEY ("blog_id") REFERENCES "public"."blog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_variant" ADD CONSTRAINT "media_variant_asset_id_media_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_asset_blog_status_created_idx" ON "media_asset" USING btree ("blog_id","status","created_at");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_cover_media_asset_blog_fk" FOREIGN KEY ("cover_image_asset_id","blog_id") REFERENCES "public"."media_asset"("id","blog_id") ON DELETE restrict ON UPDATE no action;
