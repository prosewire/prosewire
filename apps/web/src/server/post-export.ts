import { Clock, Context, Effect, Layer, Schema, Stream } from "effect";
import { BlogAccess } from "./authorization.ts";
import { PostRevision, toDashboardPost } from "./content-models.ts";
import { ContentQueries } from "./content-queries.ts";
import { Database } from "./database.ts";
import { BlogSlug, UserId } from "./domain.ts";
import { temporaryManifest } from "./export-manifest.ts";
import { exportQueries } from "./export-queries.ts";
import {
  concat,
  encode,
  json,
  jsonArray,
  jsonObject,
  zip,
} from "./export-streams.ts";
import { ObjectStorage } from "./object-storage.ts";

export class BlogNotFound extends Schema.TaggedError<BlogNotFound>()(
  "BlogNotFound",
  { slug: BlogSlug },
) {
  override get message() {
    return `Blog ${this.slug} was not found`;
  }
}
export class Input extends Schema.Class<Input>("PostExport.Input")({
  blogSlug: BlogSlug,
  actorId: UserId,
}) {}
export class MediaExportTooLarge extends Schema.TaggedError<MediaExportTooLarge>()(
  "MediaExportTooLarge",
  { byteSize: Schema.Finite },
) {
  override get message() {
    return "Media exports are limited to 256 MB per request";
  }
}
const mediaLimit = 256 * 1_024 * 1_024;
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

const csvHeader = [
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

export const create = Effect.fn("PostExport.create")(function* () {
  const content = yield* ContentQueries.Service;
  const access = yield* BlogAccess.Service;
  const storage = yield* ObjectStorage.Service;
  const database = yield* Database;
  const authorize = Effect.fn("PostExport.authorize")(function* (input: Input) {
    const blog = yield* content.getPublicBlog(input.blogSlug);
    if (!blog) return yield* new BlogNotFound({ slug: input.blogSlug });
    yield* access.requireRead(blog.id, input.actorId);
    return blog;
  });
  return {
    csv: Effect.fn("PostExport.csv")(function* (input: Input) {
      const blog = yield* authorize(input);
      const rows = exportQueries(database, blog.id).posts.pipe(
        Stream.map((post) =>
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
        ),
      );
      return {
        filename: `${blog.slug}-posts.csv`,
        contentType: "text/csv; charset=utf-8",
        body: encode(
          concat(
            Stream.make(csvHeader.map(cell).join(",")),
            rows.pipe(Stream.map((row) => `\n${row}`)),
          ),
        ),
      };
    }),
    portable: Effect.fn("PostExport.portable")(function* (input: Input) {
      const blog = yield* authorize(input);
      const queries = exportQueries(database, blog.id);
      const exportedAt = new Date(yield* Clock.currentTimeMillis);
      const posts = queries.posts.pipe(
        Stream.map((post) => {
          const { viewCount: _, ...current } = toDashboardPost(post, 0);
          return concat(
            Stream.make(`${JSON.stringify(current).slice(0, -1)},"revisions":`),
            jsonArray(
              queries.revisions(post.id).pipe(
                Stream.mapEffect((revision) =>
                  Schema.decodeUnknownEffect(PostRevision)(revision),
                ),
                Stream.map(json),
              ),
            ),
            Stream.make("}"),
          );
        }),
      );
      const media = queries.media.pipe(
        Stream.map((asset) =>
          jsonObject({
            ...Object.fromEntries(
              Object.entries({
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
                variants: asset.variants.map(
                  ({ createdAt: _, assetId: __, ...variant }) => variant,
                ),
              }).map(([key, value]) => [key, json(value)]),
            ),
            references: jsonArray(
              queries.references(asset.id).pipe(
                Stream.map((post) =>
                  json({
                    postId: post.id,
                    title: post.title,
                    slug: post.slug,
                  }),
                ),
              ),
            ),
          }),
        ),
      );
      return {
        filename: `${blog.slug}-prosewire-export.json`,
        contentType: "application/json; charset=utf-8",
        body: encode(
          jsonObject({
            format: json("prosewire-portable-export"),
            version: json(2),
            exportedAt: json(exportedAt),
            publication: json(blog),
            authors: jsonArray(queries.authors.pipe(Stream.map(json))),
            categories: jsonArray(queries.categories.pipe(Stream.map(json))),
            snippets: jsonArray(queries.snippets.pipe(Stream.map(json))),
            redirects: jsonArray(queries.redirects.pipe(Stream.map(json))),
            mediaAssets: jsonArray(media),
            posts: jsonArray(posts),
          }),
        ),
      };
    }),
    media: Effect.fn("PostExport.media")(function* (input: Input) {
      const blog = yield* authorize(input);
      const queries = exportQueries(database, blog.id);
      const byteSize = yield* queries.mediaBytes;
      if (byteSize > 0 && !storage.configured)
        return yield* new ObjectStorage.NotConfigured({
          message: "Media storage is not configured for this deployment",
        });
      if (byteSize > mediaLimit)
        return yield* new MediaExportTooLarge({ byteSize });
      const exportedAt = new Date(yield* Clock.currentTimeMillis);
      const ready = queries.media.pipe(
        Stream.filter((asset) => asset.status === "ready"),
      );
      const sourcePath = (asset: {
        readonly id: string;
        readonly variants: ReadonlyArray<{
          readonly kind: string;
          readonly storageKey: string;
        }>;
      }) =>
        `assets/${asset.id}/original.${
          asset.variants
            .find((variant) => variant.kind === "original")
            ?.storageKey.split(".")
            .at(-1) ?? "bin"
        }`;
      const manifestAsset = (asset: Stream.Success<typeof ready>) =>
        jsonObject({
          id: json(asset.id),
          filename: json(asset.originalFilename),
          mimeType: json(asset.detectedMimeType),
          byteSize: json(asset.byteSize),
          checksumSha256: json(asset.checksumSha256),
          sourcePath: json(sourcePath(asset)),
          variants: json(
            asset.variants.map(
              ({ kind, publicUrl, byteSize, checksumSha256 }) => ({
                kind,
                publicUrl,
                byteSize,
                checksumSha256,
              }),
            ),
          ),
          references: jsonArray(
            queries
              .references(asset.id)
              .pipe(
                Stream.map((post) =>
                  json({ postId: post.id, slug: post.slug }),
                ),
              ),
          ),
        });
      const body = Stream.unwrap(
        Effect.gen(function* () {
          const manifest = yield* temporaryManifest();
          const preamble = JSON.stringify({
            format: "prosewire-media-export",
            version: 1,
            exportedAt,
            publication: { id: blog.id, slug: blog.slug, name: blog.name },
          }).slice(0, -1);
          yield* manifest.append(
            new TextEncoder().encode(`${preamble},"assets":[`),
          );
          let bytes = 0;
          let first = true;
          const entries = ready.pipe(
            Stream.mapEffect(
              Effect.fn("PostExport.appendManifestAsset")(function* (asset) {
                if (!first)
                  yield* manifest.append(new TextEncoder().encode(","));
                first = false;
                yield* Stream.runForEach(
                  encode(manifestAsset(asset)),
                  manifest.append,
                );
                return asset;
              }),
            ),
            Stream.flatMap((asset) => {
              const original = asset.variants.find(
                (variant) => variant.kind === "original",
              );
              if (!original) return Stream.empty;
              return Stream.make({
                name: sourcePath(asset),
                body: storage.getStream(original.storageKey).pipe(
                  Stream.mapEffect((chunk) => {
                    bytes += chunk.byteLength;
                    return bytes > mediaLimit
                      ? Effect.fail(
                          new MediaExportTooLarge({ byteSize: bytes }),
                        )
                      : Effect.succeed(chunk);
                  }),
                ),
              });
            }),
          );
          const manifestBody = concat(
            Stream.fromEffectDrain(
              manifest.append(new TextEncoder().encode("]}")),
            ),
            manifest.body,
          );
          type ZipError =
            | Stream.Error<typeof entries>
            | Stream.Error<typeof manifestBody>
            | ObjectStorage.NotConfigured
            | ObjectStorage.StorageError
            | MediaExportTooLarge;
          return zip<ZipError>(
            Stream.concat(
              entries,
              Stream.make({ name: "manifest.json", body: manifestBody }),
            ),
          );
        }),
      );
      return {
        filename: `${blog.slug}-prosewire-media.zip`,
        contentType: "application/zip",
        body,
      };
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
