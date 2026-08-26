import { Context, Effect, Layer } from "effect";
import { PublishingRepository } from "./publishing-repository.ts";

export const create = Effect.fn("Publishing.create")(function* () {
  const repository = yield* PublishingRepository.Service;

  return {
    publishScheduled: Effect.fn("Publishing.publishScheduled")(function* (
      now: Date,
    ) {
      const published = yield* repository.publishDue(now);

      if (published.length > 0) {
        yield* Effect.logInfo(
          `Published ${published.length} scheduled post(s)`,
          {
            posts: published,
          },
        );
      }

      return published;
    }),
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/worker/Publishing",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export * as Publishing from "./publishing.js";
