import { S3Client } from "@aws-sdk/client-s3";
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Redacted } from "effect";
import { vi } from "vitest";
import { ObjectStorage } from "./object-storage.ts";

it.effect(
  "aborts S3 and waits for its request to settle before releasing the caller",
  () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const aborted = yield* Deferred.make<void>();
      let settle!: () => void;
      let finished = false;
      const client = new S3Client({ region: "auto" });
      vi.spyOn(client, "send").mockImplementation((_command, options) => {
        const signal = options?.abortSignal;
        expect(signal).toBeDefined();
        if (signal)
          signal.onabort = () => {
            Deferred.doneUnsafe(aborted, Effect.void);
          };
        Deferred.doneUnsafe(started, Effect.void);
        return new Promise((resolve) => {
          settle = () => {
            finished = true;
            resolve({ $metadata: {} });
          };
        });
      });
      const storage = ObjectStorage.make(
        {
          endpoint: "https://storage.test",
          region: "auto",
          bucket: "test",
          forcePathStyle: false,
          accessKeyId: Redacted.make("test"),
          secretAccessKey: Redacted.make("test"),
          publicUrl: "https://media.test",
          maxUploadBytes: 100,
          uploadUrlExpiresSeconds: 600,
        },
        client,
      );
      const fiber = yield* Effect.forkChild(
        storage.put("file", "image/png", new Uint8Array([1])),
      );
      yield* Deferred.await(started);
      const interrupt = yield* Effect.forkChild(Fiber.interrupt(fiber));
      yield* Deferred.await(aborted);
      expect(finished).toBe(false);
      expect(interrupt.pollUnsafe()).toBeUndefined();
      settle();
      yield* Fiber.join(interrupt);
      expect(finished).toBe(true);
      client.destroy();
    }),
);
