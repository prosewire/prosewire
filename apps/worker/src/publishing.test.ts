import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { PostId, PublishedPost } from "./domain.ts";
import { Publishing } from "./publishing.ts";
import { PublishingRepository } from "./publishing-repository.ts";

const postId = PostId.make("11111111-1111-4111-8111-111111111111");

describe("publishScheduledPosts", () => {
  it.effect("publishes due posts through the repository", () => {
    const expected: ReadonlyArray<PublishedPost> = [
      new PublishedPost({ id: postId, title: "Scheduled post" }),
    ];
    let requestedAt: Date | undefined;
    const repository = Layer.succeed(PublishingRepository.Service, {
      publishDue: (now) => {
        requestedAt = now;
        return Effect.succeed(expected);
      },
    });

    return Effect.gen(function* () {
      const publishing = yield* Publishing.Service;
      const result = yield* publishing.publishScheduled();

      expect(result).toEqual(expected);
      expect(requestedAt).toBeInstanceOf(Date);
    }).pipe(Effect.provide(Publishing.layer.pipe(Layer.provide(repository))));
  });

  it.effect("succeeds when no scheduled posts are due", () => {
    const repository = Layer.succeed(PublishingRepository.Service, {
      publishDue: () => Effect.succeed([]),
    });

    return Effect.gen(function* () {
      const publishing = yield* Publishing.Service;
      const result = yield* publishing.publishScheduled();

      expect(result).toEqual([]);
    }).pipe(Effect.provide(Publishing.layer.pipe(Layer.provide(repository))));
  });
});
