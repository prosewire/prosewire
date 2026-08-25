import { Context, Effect, Layer } from "effect";
import { WebConfig } from "./config.ts";
import { ContentQueries, type PublicPostOptions } from "./content-queries.ts";
import type { BlogSlug, PostId } from "./domain.ts";

export const create = Effect.fn("PublicContent.create")(function* () {
  const content = yield* ContentQueries.Service;
  const config = yield* WebConfig;

  return {
    blog: Effect.fn("PublicContent.blog")(function* (
      slug: BlogSlug,
      options: PublicPostOptions = {},
    ) {
      const blog = yield* content.getPublicBlog(slug);
      if (!blog) return null;
      const { posts, categories } = yield* Effect.all(
        {
          posts: content.getPublicPosts(blog.id, options),
          categories: content.getCategories(blog.id),
        },
        { concurrency: "unbounded" },
      );
      return { blog, posts, categories };
    }),
    post: Effect.fn("PublicContent.post")(function* (
      blogSlug: BlogSlug,
      postSlug: string,
    ) {
      const blog = yield* content.getPublicBlog(blogSlug);
      if (!blog) return null;
      const blogId = blog.id;
      const post = yield* content.getPublicPost(blogId, postSlug);
      if (!post) return null;
      const allPosts = yield* content.getPublicPosts(blogId);
      return { blog, post, allPosts, publicUrl: config.publicUrl };
    }),
    redirect: Effect.fn("PublicContent.redirect")(function* (
      blogSlug: BlogSlug,
      fromPath: string,
    ) {
      const blog = yield* content.getPublicBlog(blogSlug);
      if (!blog) return undefined;
      return yield* content.getPublicRedirect(blog.id, fromPath);
    }),
    redirects: Effect.fn("PublicContent.redirects")(function* (
      blogSlug: BlogSlug,
    ) {
      const blog = yield* content.getPublicBlog(blogSlug);
      if (!blog) return null;
      return yield* content.getPublicRedirects(blog.id);
    }),
    author: Effect.fn("PublicContent.author")(function* (
      blogSlug: BlogSlug,
      authorSlug: string,
    ) {
      const blog = yield* content.getPublicBlog(blogSlug);
      if (!blog) return null;
      const blogId = blog.id;
      const author = yield* content.getPublicAuthor(blogId, authorSlug);
      if (!author) return null;
      const posts = yield* content.getPublicPosts(blogId, {
        authorId: author.id,
        limit: null,
      });
      return { blog, author, posts };
    }),
    recordView: Effect.fn("PublicContent.recordView")(
      (postId: PostId, eventId: string, referrer: string | null) =>
        content.recordPostView(postId, eventId, referrer),
    ),
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/PublicContent",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export * as PublicContent from "./public-content";
