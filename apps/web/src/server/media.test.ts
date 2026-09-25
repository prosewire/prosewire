import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Result } from "effect";
import { BlogAccess } from "./authorization.ts";
import { Database, DatabaseError, type DatabaseShape } from "./database.ts";
import { ApiKeyId, BlogId, MediaAssetId } from "./domain.ts";
import { CompleteUploadInput, Media } from "./media.ts";
import { MediaImage } from "./media-image.ts";
import { ObjectStorage } from "./object-storage.ts";

const id = "11111111-1111-4111-8111-111111111111";
const input = new CompleteUploadInput({
  blogId: BlogId.make(id),
  assetId: MediaAssetId.make(id),
});
const actor = { _tag: "Api" as const, keyId: ApiKeyId.make(id) };

function fixture(
  head = Effect.succeed({ byteSize: 1, contentType: "image/png" }),
) {
  const state = {
    status: "pending",
    files: new Set<string>(),
    operations: [] as string[],
  };
  const execute = ((operation: string) =>
    Effect.suspend((): Effect.Effect<unknown, DatabaseError> => {
      state.operations.push(operation);
      switch (operation) {
        case "mediaAsset.claim":
          state.status = "processing";
          return Effect.succeed(
            Result.succeed({
              state: "claimed",
              asset: {
                uploadStorageKey: "upload",
                byteSize: 1,
                declaredMimeType: "image/png",
              },
            }),
          );
        case "mediaAsset.complete":
          state.status = "ready";
          return Effect.succeed(Result.succeed(undefined));
        case "mediaAsset.get":
          return Effect.fail(
            new DatabaseError({
              operation,
              cause: new Error("Read unavailable"),
            }),
          );
        case "mediaAsset.fail":
          state.status = "failed";
          return Effect.succeed([{ id }]);
        default:
          return Effect.die(operation);
      }
    })) as DatabaseShape["execute"];
  const layer = Media.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(Database, { client: Effect.die("Unused"), execute }),
        Layer.mock(BlogAccess.Service, {}),
        Layer.succeed(ObjectStorage.Service, {
          ...ObjectStorage.disabled,
          configured: true,
          publicUrl: (key) => `https://media.test/${key}`,
          head: () => head,
          get: () => Effect.succeed(new Uint8Array([1])),
          put: (key) =>
            Effect.sync(() => {
              state.files.add(key);
            }),
          delete: (keys) =>
            Effect.sync(() => {
              for (const key of keys) state.files.delete(key);
            }),
        }),
        Layer.succeed(MediaImage.Service, {
          process: () =>
            Effect.succeed({
              detectedMimeType: "image/png",
              width: 1,
              height: 1,
              checksumSha256: "abc",
              variants: [
                {
                  kind: "original",
                  extension: "png",
                  mimeType: "image/png",
                  body: new Uint8Array([1]),
                  byteSize: 1,
                  width: 1,
                  height: 1,
                  checksumSha256: "abc",
                },
              ],
            }),
        }),
      ),
    ),
  );
  return { state, layer };
}
const complete = Effect.flatMap(Media.Service, (media) =>
  media.completeUpload(input, actor),
);

it.effect("preserves committed variants when the response reload fails", () =>
  Effect.gen(function* () {
    const { state, layer } = fixture();
    const result = yield* Effect.result(complete.pipe(Effect.provide(layer)));
    expect(Result.isFailure(result)).toBe(true);
    expect(state.status).toBe("ready");
    expect(state.files.size).toBe(1);
    expect(state.operations).not.toContain("mediaAsset.fail");
  }),
);

it.effect("releases the claim when processing is interrupted", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const { state, layer } = fixture(
      Effect.andThen(Deferred.succeed(started, undefined), Effect.never),
    );
    const fiber = yield* Effect.forkChild(complete.pipe(Effect.provide(layer)));
    yield* Deferred.await(started);
    yield* Fiber.interrupt(fiber);
    expect(state.status).toBe("failed");
  }),
);

it.effect("releases the claim after an unexpected defect", () =>
  Effect.gen(function* () {
    const { state, layer } = fixture(Effect.die("Unexpected image failure"));
    yield* Effect.exit(complete.pipe(Effect.provide(layer)));
    expect(state.status).toBe("failed");
  }),
);
