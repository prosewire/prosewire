import { Effect, Schema } from "effect";
import { requireDashboardSessionEffect } from "@/lib/session";
import { runAppEffect } from "./app-runtime.ts";
import { BlogId, MediaAssetId, UserId } from "./domain.ts";
import { CompleteUploadInput, Media, StartUploadInput } from "./media.ts";

export type StartUploadBoundaryInput = typeof StartUploadInput.Encoded;

const invalidUpload = (message: string) => new Media.InvalidUpload({ message });

const actor = Effect.fn("MediaEntrypoints.actor")(function* () {
  const session = yield* requireDashboardSessionEffect();
  return {
    _tag: "Dashboard" as const,
    userId: UserId.make(session.user.id),
  };
});

export function startUpload(input: StartUploadBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* Schema.decodeEffect(StartUploadInput)(input).pipe(
        Effect.mapError(() => invalidUpload("Invalid media upload")),
      );
      const media = yield* Media.Service;
      return yield* media.startUpload(command, yield* actor());
    }),
  );
}

export function completeUpload(blogId: string, assetId: string) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* Schema.decodeEffect(CompleteUploadInput)({
        blogId,
        assetId,
      }).pipe(
        Effect.mapError(() => invalidUpload("Invalid media asset reference")),
      );
      const media = yield* Media.Service;
      return yield* media.completeUpload(command, yield* actor());
    }),
  );
}

export function remove(blogId: string, assetId: string) {
  return runAppEffect(
    Effect.gen(function* () {
      const decodedBlogId = yield* Schema.decodeEffect(BlogId)(blogId).pipe(
        Effect.mapError(() => invalidUpload("Invalid publication id")),
      );
      const decodedAssetId = yield* Schema.decodeEffect(MediaAssetId)(
        assetId,
      ).pipe(Effect.mapError(() => invalidUpload("Invalid media asset id")));
      const media = yield* Media.Service;
      return yield* media.remove(decodedBlogId, decodedAssetId, yield* actor());
    }),
  );
}

export * as MediaEntrypoints from "./media-entrypoints";
