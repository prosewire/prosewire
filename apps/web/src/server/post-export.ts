import { Clock, Context, Effect, Layer, Schema } from "effect";
import { strToU8, zipSync } from "fflate";
import { BlogAccess } from "./authorization.ts";
import { ContentQueries } from "./content-queries.ts";
import { BlogSlug, UserId } from "./domain.ts";
import { ObjectStorage } from "./object-storage.ts";

export class BlogNotFound extends Schema.TaggedError<BlogNotFound>()(
  "BlogNotFound",
  { slug: BlogSlug },
) {
  override get message(): string {
    return `Blog ${this.slug} was not found`;
  }
}

export class Input extends Schema.Class<Input>("PostExport.Input")({
  blogSlug: BlogSlug,
  actorId: UserId,
}) {}

export class File extends Schema.Class<File>("PostExport.File")({
  filename: Schema.String,
  contentType: Schema.String,
  body: Schema.String,
}) {}

export class BinaryFile extends Schema.Class<BinaryFile>(
  "PostExport.BinaryFile",
)({
  filename: Schema.String,
  contentType: Schema.String,
  body: Schema.Uint8Array,
}) {}

export class MediaExportTooLarge extends Schema.TaggedError<MediaExportTooLarge>()(
  "MediaExportTooLarge",
  { byteSize: Schema.Finite },
) {
  override get message(): string {
    return "Media exports are limited to 256 MB per request";
  }
}

function cell(value: unknown): string {
  let string = "";
  if (value instanceof Date) string = value.toISOString();
  else if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    string = String(value);
  }
  if (/^[\t\r\n ]*[=+\-@]/.test(string)) string = `'${string}`;
  return `"${string.replace(/"/g, '""')}"`;
}

export const create = Effect.fn("PostExport.create")(function* () {
  const content = yield* ContentQueries.Service;
  const access = yield* BlogAccess.Service;
  const storage = yield* ObjectStorage.Service;

  const authorize = Effect.fn("PostExport.authorize")(function* (input: Input) {
    const blog = yield* content.getPublicBlog(input.blogSlug);
    if (!blog) return yield* new BlogNotFound({ slug: input.blogSlug });
    yield* access.requireRead(blog.id, input.actorId);
    return blog;
  });

  return {
    csv: Effect.fn("PostExport.csv")(function* (input: Input) {
      const blog = yield* authorize(input);
      const posts = yield* content.getDashboardPosts(blog.id);
      const header = [
        "id",
        "blog_id",
        "title",
        "slug",
        "status",
        "locale",
        "author_id",
        "author_name",
        "author_slug",
        "category_ids",
        "category_slugs",
        "excerpt",
        "content_markdown",
        "content_html",
        "cover_image_asset_id",
        "cover_image_url",
        "cover_image_alt",
        "featured",
        "seo_title",
        "seo_description",
        "focus_keyword",
        "canonical_url",
        "scheduled_at",
        "published_at",
        "archived_at",
        "created_at",
        "updated_at",
      ];
      const rows = posts.map((post) =>
        [
          post.id,
          post.blogId,
          post.title,
          post.slug,
          post.status,
          post.locale,
          post.author.id,
          post.author.name,
          post.author.slug,
          post.categories.map((entry) => entry.category.id).join("|"),
          post.categories.map((entry) => entry.category.slug).join("|"),
          post.excerpt,
          post.contentMarkdown,
          post.contentHtml,
          post.coverImageAssetId,
          post.coverImageUrl,
          post.coverImageAlt,
          post.featured,
          post.seoTitle,
          post.seoDescription,
          post.focusKeyword,
          post.canonicalUrl,
          post.scheduledAt,
          post.publishedAt,
          post.archivedAt,
          post.createdAt,
          post.updatedAt,
        ]
          .map(cell)
          .join(","),
      );
      return new File({
        filename: `${blog.slug}-posts.csv`,
        contentType: "text/csv; charset=utf-8",
        body: [header.map(cell).join(","), ...rows].join("\n"),
      });
    }),
    portable: Effect.fn("PostExport.portable")(function* (input: Input) {
      const blog = yield* authorize(input);
      const { authors, categories, snippets, redirects } =
        yield* content.getContentLibrary(blog.id);
      const mediaAssets = yield* content.getMediaExport(blog.id);
      const summaries = yield* content.getDashboardPosts(blog.id);
      const posts = yield* Effect.forEach(
        summaries,
        (post) => content.getDashboardPost(post.id),
        { concurrency: 10 },
      );
      const exportedAt = new Date(yield* Clock.currentTimeMillis);
      return new File({
        filename: `${blog.slug}-prosewire-export.json`,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(
          {
            format: "prosewire-portable-export",
            version: 2,
            exportedAt,
            publication: blog,
            authors,
            categories,
            snippets,
            redirects,
            mediaAssets: mediaAssets.map((asset) => ({
              id: asset.id,
              publicationId: asset.blogId,
              filename: asset.originalFilename,
              declaredMimeType: asset.declaredMimeType,
              detectedMimeType: asset.detectedMimeType,
              byteSize: asset.byteSize,
              storageBytes: asset.storageBytes,
              width: asset.width,
              height: asset.height,
              checksumSha256: asset.checksumSha256,
              status: asset.status,
              failureReason: asset.failureReason,
              uploadedAt: asset.uploadedAt,
              deletedAt: asset.deletedAt,
              createdAt: asset.createdAt,
              updatedAt: asset.updatedAt,
              variants: asset.variants.map((variant) => ({
                kind: variant.kind,
                storageKey: variant.storageKey,
                publicUrl: variant.publicUrl,
                mimeType: variant.mimeType,
                byteSize: variant.byteSize,
                width: variant.width,
                height: variant.height,
                checksumSha256: variant.checksumSha256,
              })),
              references: asset.coverPosts.map((post) => ({
                postId: post.id,
                title: post.title,
                slug: post.slug,
              })),
            })),
            posts: posts.filter((post) => post !== undefined),
          },
          null,
          2,
        ),
      });
    }),
    media: Effect.fn("PostExport.media")(function* (input: Input) {
      const blog = yield* authorize(input);
      const assets = yield* content.getMediaExport(blog.id);
      const readyAssets = assets.filter((asset) => asset.status === "ready");
      const exportBytes = readyAssets.reduce((total, asset) => {
        const original = asset.variants.find(
          (variant) => variant.kind === "original",
        );
        return total + (original?.byteSize ?? 0);
      }, 0);
      if (exportBytes > 256 * 1_024 * 1_024) {
        return yield* new MediaExportTooLarge({ byteSize: exportBytes });
      }
      const files: Record<string, Uint8Array> = {};
      yield* Effect.forEach(
        readyAssets,
        (asset) =>
          Effect.gen(function* () {
            const original = asset.variants.find(
              (variant) => variant.kind === "original",
            );
            if (!original) return;
            const extension = original.storageKey.split(".").at(-1) ?? "bin";
            files[`assets/${asset.id}/original.${extension}`] =
              yield* storage.get(original.storageKey);
          }),
        { concurrency: 3, discard: true },
      );
      const exportedAt = new Date(yield* Clock.currentTimeMillis);
      files["manifest.json"] = strToU8(
        JSON.stringify(
          {
            format: "prosewire-media-export",
            version: 1,
            exportedAt,
            publication: { id: blog.id, slug: blog.slug, name: blog.name },
            assets: readyAssets.map((asset) => ({
              id: asset.id,
              filename: asset.originalFilename,
              mimeType: asset.detectedMimeType,
              byteSize: asset.byteSize,
              checksumSha256: asset.checksumSha256,
              sourcePath: `assets/${asset.id}/original.${
                asset.variants
                  .find((variant) => variant.kind === "original")
                  ?.storageKey.split(".")
                  .at(-1) ?? "bin"
              }`,
              variants: asset.variants.map((variant) => ({
                kind: variant.kind,
                publicUrl: variant.publicUrl,
                byteSize: variant.byteSize,
                checksumSha256: variant.checksumSha256,
              })),
              references: asset.coverPosts.map((post) => ({
                postId: post.id,
                slug: post.slug,
              })),
            })),
          },
          null,
          2,
        ),
      );
      return new BinaryFile({
        filename: `${blog.slug}-prosewire-media.zip`,
        contentType: "application/zip",
        body: zipSync(files, { level: 0 }),
      });
    }),
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/PostExport",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export * as PostExport from "./post-export";
