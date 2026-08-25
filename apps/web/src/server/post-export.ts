import { Clock, Context, Effect, Layer, Schema } from "effect";
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
  if (/^[\t\r\n ]*[=+\-@]/.test(string)) string = `'${string}`;
  return `"${string.replace(/"/g, '""')}"`;
}

export const create = Effect.fn("PostExport.create")(function* () {
  const content = yield* ContentQueries.Service;
  const access = yield* BlogAccess.Service;

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
            version: 1,
            exportedAt,
            publication: blog,
            authors,
            categories,
            snippets,
            redirects,
            posts: posts.filter((post) => post !== undefined),
          },
          null,
          2,
        ),
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
