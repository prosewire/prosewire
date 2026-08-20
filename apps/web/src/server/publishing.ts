import { and, desc, eq, inArray } from "drizzle-orm";
import { Clock, Context, Effect, Layer, Result } from "effect";
import { createExcerpt, renderMarkdown, slugify } from "@prosewire/core";
import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { ApiContent } from "./api-content.ts";
import { BlogAccess } from "./authorization.ts";
import { BlogErrors } from "./blog-errors.ts";
import { WebConfig } from "./config.ts";
import { Database, DatabaseError } from "./database.ts";
import {
  type ApiKeyId,
  type AuthorId,
  type BlogId,
  type CategoryId,
  PostId,
  type UserId,
} from "./domain.ts";
import { promiseEffect } from "./external-effect.ts";
import { PostErrors } from "./post-errors.ts";

export interface SavePostInput {
  readonly id?: PostId;
  readonly blogId: BlogId;
  readonly authorId: AuthorId;
  readonly categoryId?: CategoryId;
  readonly title: string;
  readonly requestedSlug: string;
  readonly excerpt: string;
  readonly contentMarkdown: string;
  readonly requestedStatus: "draft" | "scheduled" | "published";
  readonly featured: boolean;
  readonly locale: string;
  readonly coverImageUrl: string | null;
  readonly coverImageAlt: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly focusKeyword: string | null;
  readonly canonicalUrl: string | null;
  readonly scheduledAt: Date | null;
}

export interface BulkArchiveInput {
  readonly blogId: BlogId;
  readonly postIds: ReadonlyArray<PostId>;
}

export interface UpdateBlogSettingsInput {
  readonly blogId: BlogId;
  readonly name: string;
  readonly description: string;
  readonly locale: string;
  readonly accentColor: string;
  readonly publicUrl: string | null;
  readonly customCss: string;
}

export interface ApiActor {
  readonly blogId: BlogId;
  readonly keyId: ApiKeyId;
}

export interface ApiCreatePostInput {
  readonly authorId: AuthorId;
  readonly title: string;
  readonly slug: string;
  readonly excerpt?: string;
  readonly contentMarkdown: string;
  readonly coverImageUrl?: string | null;
  readonly coverImageAlt?: string | null;
  readonly status: "draft" | "scheduled" | "published" | "archived";
  readonly locale: string;
  readonly featured: boolean;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
  readonly focusKeyword?: string | null;
  readonly canonicalUrl?: string | null;
  readonly scheduledAt?: string | null;
  readonly categoryIds: ReadonlyArray<CategoryId>;
}

export interface ApiUpdatePostInput {
  readonly authorId?: AuthorId;
  readonly title?: string;
  readonly slug?: string;
  readonly excerpt?: string;
  readonly contentMarkdown?: string;
  readonly coverImageUrl?: string | null;
  readonly coverImageAlt?: string | null;
  readonly status?: "draft" | "scheduled" | "published" | "archived";
  readonly locale?: string;
  readonly featured?: boolean;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
  readonly focusKeyword?: string | null;
  readonly canonicalUrl?: string | null;
  readonly scheduledAt?: string | null;
  readonly categoryIds?: ReadonlyArray<CategoryId>;
}

export const create = Effect.fn("Publishing.create")(function* () {
  const database = yield* Database;
  const config = yield* WebConfig;
  const access = yield* BlogAccess.Service;
  const apiContent = yield* ApiContent.Service;

  const executeResult = <A, E>(
    operation: string,
    evaluate: (client: Db) => PromiseLike<Result.Result<A, E>>,
  ): Effect.Effect<A, DatabaseError | E> =>
    database.execute(operation, evaluate).pipe(
      Effect.flatMap(
        Result.match({
          onFailure: Effect.fail,
          onSuccess: Effect.succeed,
        }),
      ),
    );

  const savePost = Effect.fn("Publishing.savePost")(function* (
    input: SavePostInput,
    actorId: UserId,
  ) {
    yield* access.requirePostWrite(input.blogId, actorId);
    if (!input.title.trim()) {
      return yield* new PostErrors.InvalidPost({ message: "Title is required" });
    }
    const scheduledAt = input.scheduledAt;
    const status =
      input.requestedStatus === "scheduled" && !scheduledAt
        ? "draft"
        : input.requestedStatus;
    const slug = slugify(input.requestedSlug || input.title);
    const now = new Date(yield* Clock.currentTimeMillis);
    const contentHtml = yield* promiseEffect("markdown", "renderPost", () =>
      renderMarkdown(input.contentMarkdown),
    );
    const values = {
      title: input.title,
      slug,
      excerpt: input.excerpt || createExcerpt(input.contentMarkdown),
      contentMarkdown: input.contentMarkdown,
      contentHtml,
      authorId: input.authorId,
      status,
      featured: input.featured,
      locale: input.locale || "en",
      coverImageUrl: input.coverImageUrl,
      coverImageAlt: input.coverImageAlt,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      focusKeyword: input.focusKeyword,
      canonicalUrl: input.canonicalUrl,
      scheduledAt: status === "scheduled" ? scheduledAt : null,
      publishedAt: status === "published" ? now : null,
      archivedAt: null,
      updatedAt: now,
    } satisfies Partial<typeof schema.post.$inferInsert>;

    const savedId = yield* executeResult<
      string,
      PostErrors.InvalidPost | PostErrors.PostNotFound | DatabaseError
    >(
      "post.save",
      (client) =>
        client.transaction(async (tx) => {
          const [author] = await tx
            .select({ id: schema.author.id })
            .from(schema.author)
            .where(
              and(
                eq(schema.author.id, input.authorId),
                eq(schema.author.blogId, input.blogId),
              ),
            );
          if (!author) {
            return Result.fail(
              new PostErrors.InvalidPost({
                message: "Author does not belong to this blog",
              }),
            );
          }
          if (input.categoryId) {
            const [category] = await tx
              .select({ id: schema.category.id })
              .from(schema.category)
              .where(
                and(
                  eq(schema.category.id, input.categoryId),
                  eq(schema.category.blogId, input.blogId),
                ),
              );
            if (!category) {
              return Result.fail(
                new PostErrors.InvalidPost({
                  message: "Category does not belong to this blog",
                }),
              );
            }
          }
          let resolvedId = input.id;
          if (input.id) {
            const [existing] = await tx
              .select()
              .from(schema.post)
              .where(
                and(
                  eq(schema.post.id, input.id),
                  eq(schema.post.blogId, input.blogId),
                ),
              )
              .for("update");
            if (!existing) {
              return Result.fail(new PostErrors.PostNotFound({ postId: input.id }));
            }
            const latest = await tx.query.postRevision.findFirst({
              where: eq(schema.postRevision.postId, input.id),
              orderBy: [desc(schema.postRevision.version)],
            });
            await tx.insert(schema.postRevision).values({
              postId: input.id,
              editorId: actorId,
              version: (latest?.version ?? 0) + 1,
              snapshot: existing,
            });
            if (existing.slug !== slug) {
              await tx
                .insert(schema.redirect)
                .values({
                  blogId: input.blogId,
                  fromPath: existing.slug,
                  toPath: slug,
                })
                .onConflictDoUpdate({
                  target: [schema.redirect.blogId, schema.redirect.fromPath],
                  set: { toPath: slug },
                });
            }
            await tx
              .update(schema.post)
              .set(values)
              .where(
                and(
                  eq(schema.post.id, input.id),
                  eq(schema.post.blogId, input.blogId),
                ),
              );
            await tx
              .delete(schema.postCategory)
              .where(eq(schema.postCategory.postId, input.id));
          } else {
            const [created] = await tx
              .insert(schema.post)
              .values({ ...values, blogId: input.blogId, authorId: input.authorId })
              .returning({ id: schema.post.id });
            if (!created) {
              return Result.fail(
                new DatabaseError({
                  operation: "post.save returned no row",
                  cause: new Error("Unable to create post"),
                }),
              );
            }
            resolvedId = created.id as PostId;
          }
          if (!resolvedId) {
            return Result.fail(
              new DatabaseError({
                operation: "post.save resolved no id",
                cause: new Error("Unable to resolve the saved post id"),
              }),
            );
          }
          if (input.categoryId) {
            await tx.insert(schema.postCategory).values({
              postId: resolvedId,
              categoryId: input.categoryId,
            });
          }
          await tx.insert(schema.auditLog).values({
            blogId: input.blogId,
            actorId,
            action: input.id ? "post.updated" : "post.created",
            entityType: "post",
            entityId: resolvedId,
            after: { title: input.title, slug, status },
          });
          return Result.succeed(resolvedId);
        }),
    );
    return { savedId, defaultBlog: config.defaultBlog };
  });

  const bulkArchive = Effect.fn("Publishing.bulkArchive")(function* (
    input: BulkArchiveInput,
    actorId: UserId,
  ) {
    yield* access.requirePostWrite(input.blogId, actorId);
    if (input.postIds.length === 0) return false;
    const now = new Date(yield* Clock.currentTimeMillis);
    const archivedCount = yield* database.execute(
      "post.bulkArchive",
      (client) =>
        client.transaction(async (tx) => {
          const archived = await tx
            .update(schema.post)
            .set({ status: "archived", archivedAt: now, updatedAt: now })
            .where(
              and(
                inArray(schema.post.id, input.postIds),
                eq(schema.post.blogId, input.blogId),
              ),
            )
            .returning({ id: schema.post.id });
          if (archived.length > 0) {
            await tx.insert(schema.auditLog).values(
              archived.map(({ id }) => ({
                blogId: input.blogId,
                actorId,
                action: "post.archived",
                entityType: "post",
                entityId: id,
              })),
            );
          }
          return archived.length;
        }),
    );
    return archivedCount > 0;
  });

  const updateBlogSettings = Effect.fn("Publishing.updateBlogSettings")(
    function* (input: UpdateBlogSettingsInput, actorId: UserId) {
      yield* access.requireAdmin(input.blogId, actorId);
      const now = new Date(yield* Clock.currentTimeMillis);
      const values = {
        name: input.name,
        description: input.description,
        locale: input.locale || "en",
        accentColor: input.accentColor || "#ef6848",
        publicUrl: input.publicUrl,
        customCss: input.customCss,
        updatedAt: now,
      };
      yield* executeResult<string, BlogErrors.BlogNotFound>(
        "blog.updateSettings",
        (client) =>
          client.transaction(async (tx) => {
            const [updated] = await tx
              .update(schema.blog)
              .set(values)
              .where(eq(schema.blog.id, input.blogId))
              .returning({ id: schema.blog.id });
            if (!updated) {
              return Result.fail(
                new BlogErrors.BlogNotFound({ blogId: input.blogId }),
              );
            }
            await tx.insert(schema.auditLog).values({
              blogId: input.blogId,
              actorId,
              action: "blog.settings_updated",
              entityType: "blog",
              entityId: input.blogId,
              after: values,
            });
            return Result.succeed(updated.id);
          }),
      );
      return config.defaultBlog;
    },
  );

  const createApiPost = Effect.fn("Publishing.createApiPost")(function* (
    input: ApiCreatePostInput,
    actor: ApiActor,
  ) {
    const now = new Date(yield* Clock.currentTimeMillis);
    const contentHtml = yield* promiseEffect("markdown", "renderApiPost", () =>
      renderMarkdown(input.contentMarkdown),
    );
    const categoryIds = [...new Set(input.categoryIds)];
    const createdId = yield* executeResult<
      string,
      PostErrors.InvalidPost | DatabaseError
    >("post.createApi", (client) =>
      client.transaction(async (tx) => {
        const [author] = await tx
          .select({ id: schema.author.id })
          .from(schema.author)
          .where(
            and(
              eq(schema.author.id, input.authorId),
              eq(schema.author.blogId, actor.blogId),
            ),
          );
        if (!author) {
          return Result.fail(
            new PostErrors.InvalidPost({
              message: "Author does not belong to this blog",
            }),
          );
        }
        if (categoryIds.length > 0) {
          const categories = await tx
            .select({ id: schema.category.id })
            .from(schema.category)
            .where(
              and(
                eq(schema.category.blogId, actor.blogId),
                inArray(schema.category.id, categoryIds),
              ),
            );
          if (categories.length !== categoryIds.length) {
            return Result.fail(
              new PostErrors.InvalidPost({
                message: "A category does not belong to this blog",
              }),
            );
          }
        }
        const [created] = await tx
          .insert(schema.post)
          .values({
            blogId: actor.blogId,
            authorId: input.authorId,
            title: input.title,
            slug: input.slug,
            excerpt: input.excerpt ?? createExcerpt(input.contentMarkdown),
            contentMarkdown: input.contentMarkdown,
            contentHtml,
            coverImageUrl: input.coverImageUrl ?? null,
            coverImageAlt: input.coverImageAlt ?? null,
            status: input.status,
            locale: input.locale,
            featured: input.featured,
            seoTitle: input.seoTitle ?? null,
            seoDescription: input.seoDescription ?? null,
            focusKeyword: input.focusKeyword ?? null,
            canonicalUrl: input.canonicalUrl ?? null,
            scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
            publishedAt: input.status === "published" ? now : null,
          })
          .returning({ id: schema.post.id });
        if (!created) {
          return Result.fail(
            new DatabaseError({
              operation: "post.createApi returned no row",
              cause: new Error("Unable to create post"),
            }),
          );
        }
        if (categoryIds.length > 0) {
          await tx.insert(schema.postCategory).values(
            categoryIds.map((categoryId) => ({
              postId: created.id,
              categoryId,
            })),
          );
        }
        await tx.insert(schema.auditLog).values({
          blogId: actor.blogId,
          action: "post.created",
          entityType: "post",
          entityId: created.id,
          after: {
            source: "api",
            apiKeyId: actor.keyId,
            title: input.title,
            slug: input.slug,
            status: input.status,
          },
        });
        return Result.succeed(created.id);
      }),
    );
    return yield* apiContent.getPost(actor.blogId, PostId.make(createdId));
  });

  const updateApiPost = Effect.fn("Publishing.updateApiPost")(function* (
    postId: PostId,
    patch: ApiUpdatePostInput,
    actor: ApiActor,
  ) {
    const contentMarkdown = patch.contentMarkdown;
    const contentHtml =
      contentMarkdown === undefined
        ? undefined
        : yield* promiseEffect("markdown", "renderApiPostUpdate", () =>
            renderMarkdown(contentMarkdown),
          );
    const now = new Date(yield* Clock.currentTimeMillis);
    const categoryIds = patch.categoryIds
      ? [...new Set(patch.categoryIds)]
      : undefined;
    const updatedId = yield* executeResult<
      string,
      PostErrors.InvalidPost | PostErrors.PostNotFound
    >("post.updateApi", (client) =>
      client.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(schema.post)
          .where(
            and(
              eq(schema.post.id, postId),
              eq(schema.post.blogId, actor.blogId),
            ),
          )
          .for("update");
        if (!existing) {
          return Result.fail(new PostErrors.PostNotFound({ postId }));
        }
        if (patch.authorId) {
          const [author] = await tx
            .select({ id: schema.author.id })
            .from(schema.author)
            .where(
              and(
                eq(schema.author.id, patch.authorId),
                eq(schema.author.blogId, actor.blogId),
              ),
            );
          if (!author) {
            return Result.fail(
              new PostErrors.InvalidPost({
                message: "Author does not belong to this blog",
              }),
            );
          }
        }
        if (categoryIds && categoryIds.length > 0) {
          const categories = await tx
            .select({ id: schema.category.id })
            .from(schema.category)
            .where(
              and(
                eq(schema.category.blogId, actor.blogId),
                inArray(schema.category.id, categoryIds),
              ),
            );
          if (categories.length !== categoryIds.length) {
            return Result.fail(
              new PostErrors.InvalidPost({
                message: "A category does not belong to this blog",
              }),
            );
          }
        }
        const latest = await tx.query.postRevision.findFirst({
          where: eq(schema.postRevision.postId, existing.id),
          orderBy: [desc(schema.postRevision.version)],
        });
        await tx.insert(schema.postRevision).values({
          postId: existing.id,
          version: (latest?.version ?? 0) + 1,
          snapshot: existing,
        });
        if (patch.slug && patch.slug !== existing.slug) {
          await tx
            .insert(schema.redirect)
            .values({
              blogId: existing.blogId,
              fromPath: existing.slug,
              toPath: patch.slug,
            })
            .onConflictDoUpdate({
              target: [schema.redirect.blogId, schema.redirect.fromPath],
              set: { toPath: patch.slug },
            });
        }
        await tx
          .update(schema.post)
          .set({
            ...(patch.authorId ? { authorId: patch.authorId } : {}),
            ...(patch.title ? { title: patch.title } : {}),
            ...(patch.slug ? { slug: patch.slug } : {}),
            ...(patch.excerpt !== undefined ? { excerpt: patch.excerpt } : {}),
            ...(patch.contentMarkdown !== undefined
              ? { contentMarkdown: patch.contentMarkdown, contentHtml }
              : {}),
            ...(patch.coverImageUrl !== undefined
              ? { coverImageUrl: patch.coverImageUrl }
              : {}),
            ...(patch.coverImageAlt !== undefined
              ? { coverImageAlt: patch.coverImageAlt }
              : {}),
            ...(patch.status
              ? {
                  status: patch.status,
                  publishedAt:
                    patch.status === "published"
                      ? (existing.publishedAt ?? now)
                      : existing.publishedAt,
                  archivedAt: patch.status === "archived" ? now : null,
                }
              : {}),
            ...(patch.locale ? { locale: patch.locale } : {}),
            ...(patch.featured !== undefined ? { featured: patch.featured } : {}),
            ...(patch.seoTitle !== undefined ? { seoTitle: patch.seoTitle } : {}),
            ...(patch.seoDescription !== undefined
              ? { seoDescription: patch.seoDescription }
              : {}),
            ...(patch.focusKeyword !== undefined
              ? { focusKeyword: patch.focusKeyword }
              : {}),
            ...(patch.canonicalUrl !== undefined
              ? { canonicalUrl: patch.canonicalUrl }
              : {}),
            ...(patch.scheduledAt !== undefined
              ? {
                  scheduledAt: patch.scheduledAt
                    ? new Date(patch.scheduledAt)
                    : null,
                }
              : {}),
            updatedAt: now,
          })
          .where(eq(schema.post.id, existing.id));
        if (categoryIds) {
          await tx
            .delete(schema.postCategory)
            .where(eq(schema.postCategory.postId, existing.id));
          if (categoryIds.length > 0) {
            await tx.insert(schema.postCategory).values(
              categoryIds.map((categoryId) => ({
                postId: existing.id,
                categoryId,
              })),
            );
          }
        }
        await tx.insert(schema.auditLog).values({
          blogId: actor.blogId,
          action: "post.updated",
          entityType: "post",
          entityId: existing.id,
          before: existing,
          after: { source: "api", apiKeyId: actor.keyId, patch },
        });
        return Result.succeed(existing.id);
      }),
    );
    return yield* apiContent.getPost(actor.blogId, PostId.make(updatedId));
  });

  const archiveApiPost = Effect.fn("Publishing.archiveApiPost")(function* (
    postId: PostId,
    actor: ApiActor,
  ) {
    const now = new Date(yield* Clock.currentTimeMillis);
    yield* executeResult<string, PostErrors.PostNotFound>(
      "post.archiveApi",
      (client) =>
        client.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(schema.post)
            .where(
              and(
                eq(schema.post.id, postId),
                eq(schema.post.blogId, actor.blogId),
              ),
            )
            .for("update");
          if (!existing) {
            return Result.fail(new PostErrors.PostNotFound({ postId }));
          }
          await tx
            .update(schema.post)
            .set({ status: "archived", archivedAt: now, updatedAt: now })
            .where(eq(schema.post.id, existing.id));
          await tx.insert(schema.auditLog).values({
            blogId: actor.blogId,
            action: "post.archived",
            entityType: "post",
            entityId: existing.id,
            before: existing,
            after: {
              source: "api",
              apiKeyId: actor.keyId,
              status: "archived",
            },
          });
          return Result.succeed(existing.id);
        }),
    );
    return { ok: true as const };
  });

  return {
    savePost,
    bulkArchive,
    updateBlogSettings,
    createApiPost,
    updateApiPost,
    archiveApiPost,
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/Publishing",
) {}

export const layer = Layer.effect(Service, create().pipe(Effect.map(Service.of)));

export * as Publishing from "./publishing";
