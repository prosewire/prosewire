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

export type SavePostBoundaryInput = Omit<
  typeof SavePostInput.Encoded,
  "requestedStatus"
> & {
  readonly requestedStatus: string;
};
export type BulkArchiveBoundaryInput = typeof BulkArchiveInput.Encoded;
export type UpdateBlogSettingsBoundaryInput =
  typeof UpdateBlogSettingsInput.Encoded;

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
