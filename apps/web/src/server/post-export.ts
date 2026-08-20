import { Context, Effect, Layer, Schema } from "effect";
import { BlogAccess } from "./authorization.ts";
import { ContentQueries } from "./content-queries.ts";
import { BlogSlug, UserId } from "./domain.ts";

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
  return `"${string.replace(/"/g, '""')}"`;
}

export const create = Effect.fn("PostExport.create")(function* () {
  const content = yield* ContentQueries.Service;
  const access = yield* BlogAccess.Service;

  return {
    csv: Effect.fn("PostExport.csv")(function* (input: Input) {
      const blog = yield* content.getPublicBlog(input.blogSlug);
      if (!blog) return yield* new BlogNotFound({ slug: input.blogSlug });
      const blogId = blog.id;
      yield* access.requireRead(blogId, input.actorId);
      const posts = yield* content.getDashboardPosts(blogId);
      const header = [
        "id",
        "title",
        "slug",
        "status",
        "locale",
        "author",
        "categories",
        "excerpt",
        "content_markdown",
        "seo_title",
        "seo_description",
        "published_at",
        "updated_at",
      ];
      const rows = posts.map((post) =>
        [
          post.id,
          post.title,
          post.slug,
          post.status,
          post.locale,
          post.author.name,
          post.categories.map((entry) => entry.category.name).join("|"),
          post.excerpt,
          post.contentMarkdown,
          post.seoTitle,
          post.seoDescription,
          post.publishedAt,
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
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/PostExport",
) {}

export const layer = Layer.effect(Service, create().pipe(Effect.map(Service.of)));

export * as PostExport from "./post-export";
