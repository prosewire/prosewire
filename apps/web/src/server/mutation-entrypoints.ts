import { isoDateTime, postMutationFields } from "@prosewire/contract/schemas";
import { slugify } from "@prosewire/core";
import { Effect, Schema } from "effect";
import { requireDashboardSessionEffect } from "@/lib/session";
import { runAppEffect } from "./app-runtime.ts";
import { BlogErrors } from "./blog-errors.ts";
import {
  AuthorId,
  BlogId,
  CategoryId,
  MediaAssetId,
  PostId,
  UserId,
} from "./domain.ts";
import { PostErrors } from "./post-errors.ts";
import {
  ArchivePostsCommand,
  CreatePostCommand,
  Publishing,
  RestorePostRevisionCommand,
  UpdateBlogSettingsInput,
  UpdatePostCommand,
} from "./publishing.ts";

class SavePostInput extends Schema.Class<SavePostInput>(
  "MutationEntrypoints.SavePostInput",
)({
  id: Schema.optional(PostId),
  blogId: BlogId,
  authorId: AuthorId,
  categoryIds: Schema.Array(CategoryId),
  title: postMutationFields.title,
  requestedSlug: Schema.String,
  excerpt: postMutationFields.excerpt,
  contentMarkdown: postMutationFields.contentMarkdown,
  requestedStatus: Schema.Literals(["draft", "scheduled", "published"]),
  featured: Schema.Boolean,
  locale: postMutationFields.locale,
  coverImageAssetId: Schema.NullOr(MediaAssetId),
  coverImageUrl: postMutationFields.coverImageUrl,
  coverImageAlt: postMutationFields.coverImageAlt,
  seoTitle: postMutationFields.seoTitle,
  seoDescription: postMutationFields.seoDescription,
  focusKeyword: postMutationFields.focusKeyword,
  canonicalUrl: postMutationFields.canonicalUrl,
  scheduledAt: Schema.NullOr(
    isoDateTime.pipe(Schema.decodeTo(Schema.DateFromString)),
  ),
}) {}

export type SavePostBoundaryInput = Omit<
  typeof SavePostInput.Encoded,
  "requestedStatus"
> & {
  readonly requestedStatus: string;
};
export type BulkArchiveBoundaryInput = Omit<
  typeof ArchivePostsCommand.Encoded,
  "requireAll"
>;
export type RestorePostRevisionBoundaryInput =
  typeof RestorePostRevisionCommand.Encoded;
export type UpdateBlogSettingsBoundaryInput =
  typeof UpdateBlogSettingsInput.Encoded;

const invalidInput = (message: string) =>
  new PostErrors.InvalidPost({ message });

const decodeSavePost = (input: unknown) =>
  Schema.decodeUnknownEffect(SavePostInput)(input).pipe(
    Effect.mapError(() => invalidInput("Invalid post form data")),
  );

const decodeBulkArchive = (input: unknown) =>
  Schema.decodeUnknownEffect(ArchivePostsCommand)({
    ...(typeof input === "object" && input !== null ? input : {}),
    requireAll: false,
  }).pipe(Effect.mapError(() => invalidInput("Invalid post selection")));

const decodeRestorePostRevision = (input: unknown) =>
  Schema.decodeUnknownEffect(RestorePostRevisionCommand)(input).pipe(
    Effect.mapError(() => invalidInput("Invalid revision selection")),
  );

const decodeBlogSettings = (input: unknown) =>
  Schema.decodeUnknownEffect(UpdateBlogSettingsInput)(input).pipe(
    Effect.mapError(
      () =>
        new BlogErrors.InvalidBlogSettings({
          message: "Invalid blog settings",
        }),
    ),
  );

const currentActorId = Effect.fn("MutationEntrypoints.currentActorId")(
  function* () {
    const session = yield* requireDashboardSessionEffect();
    return UserId.make(session.user.id);
  },
);

export function savePost(input: SavePostBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decodeSavePost(input);
      const actorId = yield* currentActorId();
      const publishing = yield* Publishing.Service;
      const fields = {
        blogId: command.blogId,
        authorId: command.authorId,
        title: command.title,
        slug: slugify(command.requestedSlug || command.title),
        excerpt: command.excerpt,
        contentMarkdown: command.contentMarkdown,
        coverImageAssetId: command.coverImageAssetId,
        coverImageUrl: command.coverImageUrl,
        coverImageAlt: command.coverImageAlt,
        status: command.requestedStatus,
        locale: command.locale || "en",
        featured: command.featured,
        seoTitle: command.seoTitle,
        seoDescription: command.seoDescription,
        focusKeyword: command.focusKeyword,
        canonicalUrl: command.canonicalUrl,
        scheduledAt: command.scheduledAt,
        categoryIds: command.categoryIds,
      } as const;
      const result = command.id
        ? yield* publishing.updatePost(
            yield* Schema.decodeEffect(Schema.toType(UpdatePostCommand))({
              postId: command.id,
              ...fields,
            }).pipe(
              Effect.mapError(() => invalidInput("Invalid post form data")),
            ),
            { _tag: "Dashboard", userId: actorId },
          )
        : yield* publishing.createPost(
            yield* Schema.decodeEffect(Schema.toType(CreatePostCommand))(
              fields,
            ).pipe(
              Effect.mapError(() => invalidInput("Invalid post form data")),
            ),
            {
              _tag: "Dashboard",
              userId: actorId,
            },
          );
      return { savedId: result.postId, blogSlug: result.blogSlug };
    }),
  );
}

export function bulkArchive(input: BulkArchiveBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decodeBulkArchive(input);
      const actorId = yield* currentActorId();
      const publishing = yield* Publishing.Service;
      const result = yield* publishing.archivePosts(command, {
        _tag: "Dashboard",
        userId: actorId,
      });
      return result.archived > 0;
    }),
  );
}

export function restorePostRevision(input: RestorePostRevisionBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decodeRestorePostRevision(input);
      const actorId = yield* currentActorId();
      const publishing = yield* Publishing.Service;
      return yield* publishing.restorePostRevision(command, {
        _tag: "Dashboard",
        userId: actorId,
      });
    }),
  );
}

export function updateBlogSettings(input: UpdateBlogSettingsBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decodeBlogSettings(input);
      const actorId = yield* currentActorId();
      const publishing = yield* Publishing.Service;
      return yield* publishing.updateBlogSettings(command, actorId);
    }),
  );
}

export * as MutationEntrypoints from "./mutation-entrypoints";
