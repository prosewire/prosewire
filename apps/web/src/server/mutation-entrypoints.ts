import { slugify } from "@prosewire/core";
import { Effect, Schema } from "effect";
import { requireDashboardSessionEffect } from "@/lib/session";
import { runAppEffect } from "./app-runtime.ts";
import { BlogErrors } from "./blog-errors.ts";
import { UserId } from "./domain.ts";
import {
  ArchivePostsCommand,
  CreatePostCommand,
  RestorePostRevisionCommand,
  UpdatePostCommand,
} from "./post-commands.ts";
import { PostErrors } from "./post-errors.ts";
import { SavePostInput } from "./post-form-input.ts";
import {
  PublishingRepository,
  UpdateBlogSettingsInput,
} from "./publishing-repository.ts";

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
      const publishing = yield* PublishingRepository.Service;
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
      const publishing = yield* PublishingRepository.Service;
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
      const publishing = yield* PublishingRepository.Service;
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
      const publishing = yield* PublishingRepository.Service;
      return yield* publishing.updateBlogSettings(command, actorId);
    }),
  );
}

export * as MutationEntrypoints from "./mutation-entrypoints";
