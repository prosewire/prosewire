import { createClient } from "@redis/client";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import * as PersistenceRedis from "effect/unstable/persistence/Redis";
import * as JobQueueConfig from "./config.ts";

export class ConnectionError extends Schema.TaggedError<ConnectionError>()(
  "JobRedisConnectionError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export interface Interface {
  readonly ping: Effect.Effect<void, ConnectionError>;
  readonly send: <A = unknown>(
    command: string,
    ...args: ReadonlyArray<string>
  ) => Effect.Effect<A, PersistenceRedis.RedisError>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/jobs/Redis",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* JobQueueConfig.Service;
    const client = createClient({
      url: Redacted.value(config.redisUrl),
      disableOfflineQueue: true,
    });
    client.on("error", (cause) => {
      console.error("Redis client error", cause);
    });

    yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => client.connect(),
        catch: (cause) =>
          new ConnectionError({ operation: "connect to Redis", cause }),
      }),
      () =>
        Effect.promise(async () => {
          if (client.isOpen) await client.close();
        }),
    );

    const send = <A = unknown>(
      command: string,
      ...args: ReadonlyArray<string>
    ) =>
      Effect.tryPromise({
        try: () => client.sendCommand<A>([command, ...args]),
        catch: (cause) => new PersistenceRedis.RedisError({ cause }),
      });

    const ping = send<string>("PING").pipe(
      Effect.asVoid,
      Effect.mapError(
        (error) =>
          new ConnectionError({ operation: "ping Redis", cause: error.cause }),
      ),
    );

    return Service.of({ ping, send });
  }),
);

export const persistenceLayer = Layer.effect(
  PersistenceRedis.Redis,
  Effect.gen(function* () {
    const redis = yield* Service;
    return yield* PersistenceRedis.make({ send: redis.send });
  }),
);
