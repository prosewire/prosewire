import { Effect, Schema } from "effect";
import { requireDashboardSessionEffect } from "@/lib/session";
import { runAppEffect } from "./app-runtime.ts";
import { BlogErrors } from "./blog-errors.ts";
import { UserId } from "./domain.ts";
import { PostErrors } from "./post-errors.ts";
import {
  BulkArchiveInput,
  Publishing,
  SavePostInput,
  UpdateBlogSettingsInput,
} from "./publishing.ts";

export interface SavePostBoundaryInput {
  readonly id?: string;
  readonly blogId: string;
  readonly authorId: string;
  readonly categoryId?: string;
  readonly title: string;
  readonly requestedSlug: string;
  readonly excerpt: string;
  readonly contentMarkdown: string;
  readonly requestedStatus: string;
  readonly featured: boolean;
  readonly locale: string;
  readonly coverImageUrl: string | null;
  readonly coverImageAlt: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly focusKeyword: string | null;
  readonly canonicalUrl: string | null;
  readonly scheduledAt: string | null;
}

export interface BulkArchiveBoundaryInput {
  readonly blogId: string;
  readonly postIds: ReadonlyArray<string>;
}

export interface UpdateBlogSettingsBoundaryInput {
  readonly blogId: string;
  readonly name: string;
  readonly description: string;
  readonly locale: string;
  readonly accentColor: string;
  readonly publicUrl: string | null;
  readonly customCss: string;
}

const invalidInput = (message: string) =>
  new PostErrors.InvalidPost({ message });

const decodeSavePost = (input: unknown) =>
  Schema.decodeUnknownEffect(SavePostInput)(input).pipe(
    Effect.mapError(() => invalidInput("Invalid post form data")),
  );

const decodeBulkArchive = (input: unknown) =>
  Schema.decodeUnknownEffect(BulkArchiveInput)(input).pipe(
    Effect.mapError(() => invalidInput("Invalid post selection")),
  );

const decodeBlogSettings = (input: unknown) =>
  Schema.decodeUnknownEffect(UpdateBlogSettingsInput)(input).pipe(
    Effect.mapError(
      () => new BlogErrors.InvalidBlogSettings({ message: "Invalid blog settings" }),
    ),
  );

const currentActorId = Effect.fn("MutationEntrypoints.currentActorId")(function* () {
  const session = yield* requireDashboardSessionEffect();
  return UserId.make(session.user.id);
});

export function savePost(input: SavePostBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decodeSavePost(input);
      const actorId = yield* currentActorId();
      const publishing = yield* Publishing.Service;
      return yield* publishing.savePost(command, actorId);
    }),
  );
}

export function bulkArchive(input: BulkArchiveBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decodeBulkArchive(input);
      const actorId = yield* currentActorId();
      const publishing = yield* Publishing.Service;
      return yield* publishing.bulkArchive(command, actorId);
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
