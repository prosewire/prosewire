import {
  canUpdatePost,
  createExcerpt,
  hasPermission,
  renderMarkdown,
  type TeamRole,
} from "@prosewire/core";
import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Clock, Context, Effect, Layer, Result, Schema } from "effect";
import { ApiAccess, hasScope } from "./api-access.ts";
import { BlogAccess } from "./authorization.ts";
import { BlogErrors } from "./blog-errors.ts";
import { Database } from "./database.ts";
import {
  type ApiKeyId,
  AuthorId,
  BlogId,
  type CategoryId,
  OrganizationId,
  PostId,
  UserId,
} from "./domain.ts";
import { promiseEffect } from "./external-effect.ts";
import { operationError } from "./operation-error.ts";
import type {
  Actor,
  ArchivePostsCommand,
  ArchiveResult,
  CreatePostCommand,
  MutationResult,
  UpdatePostCommand,
} from "./post-commands.ts";
import { PostErrors } from "./post-errors.ts";
import {
  lockApiKey,
  lockBlogAuthorization,
  type TransactionClient,
} from "./transactional-access.ts";

export class UpdateBlogSettingsInput extends Schema.Class<UpdateBlogSettingsInput>(
  "Publishing.UpdateBlogSettingsInput",
)({
  blogId: BlogId,
  name: Schema.String,
  description: Schema.String,
  locale: Schema.String,
  accentColor: Schema.String,
  publicUrl: Schema.NullOr(Schema.String),
  customCss: Schema.String,
}) {}

export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "PublishingRepositoryPersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

type LockedActor =
  | {
      readonly _tag: "Dashboard";
      readonly organizationId: OrganizationId;
      readonly blogSlug: string;
      readonly userId: UserId;
      readonly role: TeamRole;
    }
  | {
      readonly _tag: "Api";
      readonly organizationId: OrganizationId;
      readonly blogSlug: string;
      readonly keyId: ApiKeyId;
    };

export const create = Effect.fn("PublishingRepository.create")(function* () {
  const database = yield* Database;
  const persistenceError = operationError(
    (input) => new PersistenceError(input),
  );
  const execute = <A>(
    operation: string,
    evaluate: (client: Db) => PromiseLike<A>,
  ) => database.execute(operation, evaluate).pipe(persistenceError(operation));

  const executeResult = <A, E>(
    operation: string,
    evaluate: (client: Db) => PromiseLike<Result.Result<A, E>>,
  ): Effect.Effect<A, PersistenceError | E> =>
    execute(operation, evaluate).pipe(
      Effect.flatMap(
        Result.match({
          onFailure: Effect.fail,
          onSuccess: Effect.succeed,
        }),
      ),
    );

  const lockApiWrite = async (
    transaction: TransactionClient,
    blogId: BlogId,
    keyId: ApiKeyId,
    now: Date,
  ) => {
    const authorization = await lockApiKey(transaction, blogId, keyId);
    if (
      !authorization ||
      (authorization.key.expiresAt && authorization.key.expiresAt <= now)
    ) {
      return {
        error: new ApiAccess.AuthenticationFailed({
          message: "Invalid or expired API key",
        }),
      } as const;
    }
    if (!hasScope(authorization.key.scopes, "content:write")) {
      return {
        error: new ApiAccess.ScopeDenied({ requiredScope: "content:write" }),
      } as const;
    }
    return {
      organizationId: OrganizationId.make(authorization.organizationId),
      blogSlug: authorization.blogSlug,
    } as const;
  };

  const lockActor = async (
    tx: TransactionClient,
    blogId: BlogId,
    actor: Actor,
    capability: "content:create" | "content:read",
    now: Date,
  ): Promise<
    Result.Result<
      LockedActor,
      | BlogAccess.BlogAccessDenied
      | ApiAccess.AuthenticationFailed
      | ApiAccess.ScopeDenied
    >
  > => {
    if (actor._tag === "Dashboard") {
      const authorization = await lockBlogAuthorization(
        tx,
        blogId,
        actor.userId,
        capability,
      );
      if (!authorization) {
        return Result.fail(
          new BlogAccess.BlogAccessDenied({
            blogId,
            userId: actor.userId,
            capability,
          }),
        );
      }
      return Result.succeed({
        _tag: "Dashboard",
        organizationId: authorization.workspace.id,
        blogSlug: authorization.blog.slug,
        userId: actor.userId,
        role: authorization.role,
      });
    }

    const authorization = await lockApiWrite(tx, blogId, actor.keyId, now);
    if ("error" in authorization) return Result.fail(authorization.error);
    return Result.succeed({
      _tag: "Api",
      organizationId: authorization.organizationId,
      blogSlug: authorization.blogSlug,
      keyId: actor.keyId,
    });
  };

  const validatePublicationLinks = async (
    tx: TransactionClient,
    blogId: BlogId,
    authorId: AuthorId,
    categoryIds: ReadonlyArray<CategoryId>,
  ): Promise<PostErrors.InvalidPost | undefined> => {
    const [author] = await tx
      .select({ id: schema.author.id })
      .from(schema.author)
      .where(
        and(eq(schema.author.id, authorId), eq(schema.author.blogId, blogId)),
      );
    if (!author) {
      return new PostErrors.InvalidPost({
        message: "Author does not belong to this blog",
      });
    }
    if (categoryIds.length === 0) return undefined;
    const categories = await tx
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(
        and(
          eq(schema.category.blogId, blogId),
          inArray(schema.category.id, categoryIds),
        ),
      );
    if (categories.length !== categoryIds.length) {
      return new PostErrors.InvalidPost({
        message: "A category does not belong to this blog",
      });
    }
    return undefined;
  };

  const createPost = Effect.fn("Publishing.createPost")(function* (
    command: CreatePostCommand,
    actor: Actor,
  ) {
    if (!command.title.trim()) {
      return yield* new PostErrors.InvalidPost({
        message: "Title is required",
      });
    }
    if (!command.slug.trim()) {
      return yield* new PostErrors.InvalidPost({ message: "Slug is required" });
    }
    if (command.status === "scheduled" && !command.scheduledAt) {
      return yield* new PostErrors.InvalidPost({
        message: "Scheduled posts require a schedule time",
      });
    }
    const categoryIds = [...new Set(command.categoryIds)];
    const now = new Date(yield* Clock.currentTimeMillis);
    const contentHtml = yield* promiseEffect(
      "markdown.renderPostCreate",
      () => renderMarkdown(command.contentMarkdown),
      (cause) =>
        new PostErrors.PostRenderingFailed({ operation: "create", cause }),
    );

    return yield* executeResult<
      MutationResult,
      | PostErrors.InvalidPost
      | PersistenceError
      | BlogAccess.BlogAccessDenied
      | ApiAccess.AuthenticationFailed
      | ApiAccess.ScopeDenied
    >("post.create", (client) =>
      client.transaction(async (tx) => {
        const authorization = await lockActor(
          tx,
          command.blogId,
          actor,
          "content:create",
          now,
        );
        if (Result.isFailure(authorization)) {
          return Result.fail(authorization.failure);
        }
        const locked = authorization.success;
        if (
          locked._tag === "Dashboard" &&
          (command.status === "scheduled" || command.status === "published") &&
          !hasPermission(locked.role, "content:publish")
        ) {
          return Result.fail(
            new BlogAccess.BlogAccessDenied({
              blogId: command.blogId,
              userId: locked.userId,
              capability: "content:publish",
            }),
          );
        }
        if (
          locked._tag === "Dashboard" &&
          command.status === "archived" &&
          !hasPermission(locked.role, "content:archive")
        ) {
          return Result.fail(
            new BlogAccess.BlogAccessDenied({
              blogId: command.blogId,
              userId: locked.userId,
              capability: "content:archive",
            }),
          );
        }
        const invalidLink = await validatePublicationLinks(
          tx,
          command.blogId,
          command.authorId,
          categoryIds,
        );
        if (invalidLink) return Result.fail(invalidLink);

        const [created] = await tx
          .insert(schema.post)
          .values({
            blogId: command.blogId,
            authorId: command.authorId,
            title: command.title,
            slug: command.slug,
            excerpt: command.excerpt || createExcerpt(command.contentMarkdown),
            contentMarkdown: command.contentMarkdown,
            contentHtml,
            coverImageUrl: command.coverImageUrl ?? null,
            coverImageAlt: command.coverImageAlt ?? null,
            status: command.status,
            locale: command.locale || "en",
            featured: command.featured,
            seoTitle: command.seoTitle ?? null,
            seoDescription: command.seoDescription ?? null,
            focusKeyword: command.focusKeyword ?? null,
            canonicalUrl: command.canonicalUrl ?? null,
            scheduledAt:
              command.status === "scheduled"
                ? (command.scheduledAt ?? null)
                : null,
            publishedAt: command.status === "published" ? now : null,
            archivedAt: command.status === "archived" ? now : null,
            createdById: locked._tag === "Dashboard" ? locked.userId : null,
            updatedById: locked._tag === "Dashboard" ? locked.userId : null,
          })
          .returning({ id: schema.post.id });
        if (!created) {
          return Result.fail(
            new PersistenceError({
              operation: "post.create returned no row",
              cause: new Error("Unable to create post"),
            }),
          );
        }
        const postId = PostId.make(created.id);
        if (categoryIds.length > 0) {
          await tx.insert(schema.postCategory).values(
            categoryIds.map((categoryId) => ({
              postId,
              categoryId,
              blogId: command.blogId,
            })),
          );
        }
        await tx.insert(schema.auditLog).values({
          organizationId: locked.organizationId,
          blogId: command.blogId,
          actorId: locked._tag === "Dashboard" ? locked.userId : null,
          action: "post.created",
          entityType: "post",
          entityId: postId,
          after: {
            source: locked._tag === "Dashboard" ? "dashboard" : "api",
            ...(locked._tag === "Api" ? { apiKeyId: locked.keyId } : {}),
            title: command.title,
            slug: command.slug,
            status: command.status,
            categoryIds,
          },
        });
        return Result.succeed({ postId, blogSlug: locked.blogSlug });
      }),
    );
  });

  const updatePost = Effect.fn("Publishing.updatePost")(function* (
    command: UpdatePostCommand,
    actor: Actor,
  ) {
    if (command.title !== undefined && !command.title.trim()) {
      return yield* new PostErrors.InvalidPost({
        message: "Title is required",
      });
    }
    if (command.slug !== undefined && !command.slug.trim()) {
      return yield* new PostErrors.InvalidPost({ message: "Slug is required" });
    }
    const renderedHtml =
      command.contentMarkdown === undefined
        ? undefined
        : yield* promiseEffect(
            "markdown.renderPostUpdate",
            () => renderMarkdown(command.contentMarkdown as string),
            (cause) =>
              new PostErrors.PostRenderingFailed({
                operation: "update",
                cause,
              }),
          );
    const categoryIds =
      command.categoryIds === undefined
        ? undefined
        : [...new Set(command.categoryIds)];
    const now = new Date(yield* Clock.currentTimeMillis);

    return yield* executeResult<
      MutationResult,
      | PostErrors.InvalidPost
      | PostErrors.PostNotFound
      | BlogAccess.BlogAccessDenied
      | ApiAccess.AuthenticationFailed
      | ApiAccess.ScopeDenied
    >("post.update", (client) =>
      client.transaction(async (tx) => {
        const authorization = await lockActor(
          tx,
          command.blogId,
          actor,
          "content:read",
          now,
        );
        if (Result.isFailure(authorization)) {
          return Result.fail(authorization.failure);
        }
        const locked = authorization.success;
        const [existing] = await tx
          .select()
          .from(schema.post)
          .where(
            and(
              eq(schema.post.id, command.postId),
              eq(schema.post.blogId, command.blogId),
            ),
          )
          .for("update");
        if (!existing) {
          return Result.fail(
            new PostErrors.PostNotFound({ postId: command.postId }),
          );
        }

        const nextStatus = command.status ?? existing.status;
        const nextScheduledAt =
          command.scheduledAt === undefined
            ? existing.scheduledAt
            : command.scheduledAt;
        if (nextStatus === "scheduled" && !nextScheduledAt) {
          return Result.fail(
            new PostErrors.InvalidPost({
              message: "Scheduled posts require a schedule time",
            }),
          );
        }
        if (locked._tag === "Dashboard") {
          const createdById = existing.createdById
            ? UserId.make(existing.createdById)
            : null;
          if (!canUpdatePost(locked.role, createdById, locked.userId)) {
            return Result.fail(
              new BlogAccess.BlogAccessDenied({
                blogId: command.blogId,
                userId: locked.userId,
                capability: "content:update:any",
              }),
            );
          }
          if (
            (existing.status === "archived" || nextStatus === "archived") &&
            !hasPermission(locked.role, "content:archive")
          ) {
            return Result.fail(
              new BlogAccess.BlogAccessDenied({
                blogId: command.blogId,
                userId: locked.userId,
                capability: "content:archive",
              }),
            );
          }
          if (
            (nextStatus === "scheduled" ||
              nextStatus === "published" ||
              existing.status === "scheduled" ||
              existing.status === "published") &&
            !hasPermission(locked.role, "content:publish")
          ) {
            return Result.fail(
              new BlogAccess.BlogAccessDenied({
                blogId: command.blogId,
                userId: locked.userId,
                capability: "content:publish",
              }),
            );
          }
        }

        const nextAuthorId =
          command.authorId ?? AuthorId.make(existing.authorId);
        const invalidLink = await validatePublicationLinks(
          tx,
          command.blogId,
          nextAuthorId,
          categoryIds ?? [],
        );
        if (invalidLink) return Result.fail(invalidLink);

        const latest = await tx.query.postRevision.findFirst({
          where: eq(schema.postRevision.postId, existing.id),
          orderBy: [desc(schema.postRevision.version)],
        });
        await tx.insert(schema.postRevision).values({
          postId: existing.id,
          editorId: locked._tag === "Dashboard" ? locked.userId : null,
          version: (latest?.version ?? 0) + 1,
          snapshot: existing,
        });

        const nextSlug = command.slug ?? existing.slug;
        if (nextSlug !== existing.slug) {
          await tx
            .insert(schema.redirect)
            .values({
              blogId: command.blogId,
              fromPath: existing.slug,
              toPath: nextSlug,
            })
            .onConflictDoUpdate({
              target: [schema.redirect.blogId, schema.redirect.fromPath],
              set: { toPath: nextSlug },
            });
        }
        const nextMarkdown =
          command.contentMarkdown ?? existing.contentMarkdown;
        const nextExcerpt =
          command.excerpt === undefined
            ? existing.excerpt
            : command.excerpt || createExcerpt(nextMarkdown);
        await tx
          .update(schema.post)
          .set({
            authorId: nextAuthorId,
            title: command.title ?? existing.title,
            slug: nextSlug,
            excerpt: nextExcerpt,
            contentMarkdown: nextMarkdown,
            contentHtml: renderedHtml ?? existing.contentHtml,
            coverImageUrl:
              command.coverImageUrl === undefined
                ? existing.coverImageUrl
                : command.coverImageUrl,
            coverImageAlt:
              command.coverImageAlt === undefined
                ? existing.coverImageAlt
                : command.coverImageAlt,
            status: nextStatus,
            locale: command.locale ?? existing.locale,
            featured: command.featured ?? existing.featured,
            seoTitle:
              command.seoTitle === undefined
                ? existing.seoTitle
                : command.seoTitle,
            seoDescription:
              command.seoDescription === undefined
                ? existing.seoDescription
                : command.seoDescription,
            focusKeyword:
              command.focusKeyword === undefined
                ? existing.focusKeyword
                : command.focusKeyword,
            canonicalUrl:
              command.canonicalUrl === undefined
                ? existing.canonicalUrl
                : command.canonicalUrl,
            scheduledAt: nextStatus === "scheduled" ? nextScheduledAt : null,
            publishedAt:
              nextStatus === "published" ? (existing.publishedAt ?? now) : null,
            archivedAt:
              nextStatus === "archived" ? (existing.archivedAt ?? now) : null,
            updatedById:
              locked._tag === "Dashboard"
                ? locked.userId
                : existing.updatedById,
            updatedAt: now,
          })
          .where(eq(schema.post.id, existing.id));
        if (categoryIds !== undefined) {
          await tx
            .delete(schema.postCategory)
            .where(eq(schema.postCategory.postId, existing.id));
          if (categoryIds.length > 0) {
            await tx.insert(schema.postCategory).values(
              categoryIds.map((categoryId) => ({
                postId: existing.id,
                categoryId,
                blogId: command.blogId,
              })),
            );
          }
        }
        await tx.insert(schema.auditLog).values({
          organizationId: locked.organizationId,
          blogId: command.blogId,
          actorId: locked._tag === "Dashboard" ? locked.userId : null,
          action: "post.updated",
          entityType: "post",
          entityId: existing.id,
          before: existing,
          after: {
            source: locked._tag === "Dashboard" ? "dashboard" : "api",
            ...(locked._tag === "Api" ? { apiKeyId: locked.keyId } : {}),
            title: command.title ?? existing.title,
            slug: nextSlug,
            status: nextStatus,
            ...(categoryIds === undefined ? {} : { categoryIds }),
          },
        });
        return Result.succeed({
          postId: PostId.make(existing.id),
          blogSlug: locked.blogSlug,
        });
      }),
    );
  });

  const archivePosts = Effect.fn("Publishing.archivePosts")(function* (
    command: ArchivePostsCommand,
    actor: Actor,
  ) {
    const postIds = [...new Set(command.postIds)];
    if (postIds.length === 0) {
      return { archived: 0, blogSlug: "" } satisfies ArchiveResult;
    }
    const now = new Date(yield* Clock.currentTimeMillis);
    return yield* executeResult<
      ArchiveResult,
      | PostErrors.PostNotFound
      | BlogAccess.BlogAccessDenied
      | ApiAccess.AuthenticationFailed
      | ApiAccess.ScopeDenied
    >("post.archive", (client) =>
      client.transaction(async (tx) => {
        const authorization = await lockActor(
          tx,
          command.blogId,
          actor,
          "content:read",
          now,
        );
        if (Result.isFailure(authorization)) {
          return Result.fail(authorization.failure);
        }
        const locked = authorization.success;
        const requested = await tx
          .select()
          .from(schema.post)
          .where(
            and(
              inArray(schema.post.id, postIds),
              eq(schema.post.blogId, command.blogId),
            ),
          )
          .for("update");
        if (command.requireAll && requested.length !== postIds.length) {
          const found = new Set(requested.map(({ id }) => id));
          const missing = postIds.find((postId) => !found.has(postId));
          if (missing) {
            return Result.fail(
              new PostErrors.PostNotFound({ postId: missing }),
            );
          }
        }
        const candidates = requested.filter(
          ({ status }) => status !== "archived",
        );
        if (locked._tag === "Dashboard") {
          if (
            !hasPermission(locked.role, "content:archive") ||
            candidates.some(
              (post) =>
                !canUpdatePost(
                  locked.role,
                  post.createdById ? UserId.make(post.createdById) : null,
                  locked.userId,
                ),
            )
          ) {
            return Result.fail(
              new BlogAccess.BlogAccessDenied({
                blogId: command.blogId,
                userId: locked.userId,
                capability: "content:archive",
              }),
            );
          }
        }
        if (candidates.length === 0) {
          return Result.succeed({ archived: 0, blogSlug: locked.blogSlug });
        }

        const candidateIds = candidates.map(({ id }) => id);
        const revisions = await tx.query.postRevision.findMany({
          where: inArray(schema.postRevision.postId, candidateIds),
          orderBy: [desc(schema.postRevision.version)],
        });
        const latestVersion = new Map<string, number>();
        for (const revision of revisions) {
          if (!latestVersion.has(revision.postId)) {
            latestVersion.set(revision.postId, revision.version);
          }
        }
        await tx.insert(schema.postRevision).values(
          candidates.map((post) => ({
            postId: post.id,
            editorId: locked._tag === "Dashboard" ? locked.userId : null,
            version: (latestVersion.get(post.id) ?? 0) + 1,
            snapshot: post,
          })),
        );
        const archived = await tx
          .update(schema.post)
          .set({
            status: "archived",
            archivedAt: now,
            updatedById:
              locked._tag === "Dashboard" ? locked.userId : undefined,
            updatedAt: now,
          })
          .where(inArray(schema.post.id, candidateIds))
          .returning({ id: schema.post.id });
        await tx.insert(schema.auditLog).values(
          archived.map(({ id }) => ({
            organizationId: locked.organizationId,
            blogId: command.blogId,
            actorId: locked._tag === "Dashboard" ? locked.userId : null,
            action: "post.archived",
            entityType: "post",
            entityId: id,
            after: {
              source: locked._tag === "Dashboard" ? "dashboard" : "api",
              ...(locked._tag === "Api" ? { apiKeyId: locked.keyId } : {}),
              status: "archived",
            },
          })),
        );
        return Result.succeed({
          archived: archived.length,
          blogSlug: locked.blogSlug,
        });
      }),
    );
  });

  const updateBlogSettings = Effect.fn("Publishing.updateBlogSettings")(
    function* (input: UpdateBlogSettingsInput, actorId: UserId) {
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
      return yield* executeResult<
        string,
        BlogErrors.BlogNotFound | BlogAccess.BlogAccessDenied
      >("blog.updateSettings", (client) =>
        client.transaction(async (tx) => {
          const authorization = await lockBlogAuthorization(
            tx,
            input.blogId,
            actorId,
            "publications:update",
          );
          if (!authorization) {
            return Result.fail(
              new BlogAccess.BlogAccessDenied({
                blogId: input.blogId,
                userId: actorId,
                capability: "publications:update",
              }),
            );
          }
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
            organizationId: authorization.workspace.id,
            blogId: input.blogId,
            actorId,
            action: "blog.settings_updated",
            entityType: "blog",
            entityId: input.blogId,
            after: values,
          });
          return Result.succeed(authorization.blog.slug);
        }),
      );
    },
  );

  return {
    createPost,
    updatePost,
    archivePosts,
    updateBlogSettings,
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/PublishingRepository",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export * as PublishingRepository from "./publishing-repository";
