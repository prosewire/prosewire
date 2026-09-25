import { createClient } from "@redis/client";
import { Context, Effect, Layer, Redacted, Schema, type Scope } from "effect";
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
  readonly subscribe: (
    channel: string,
    onMessage: (message: PersistenceRedis.RedisMessage) => void,
  ) => Effect.Effect<
    Effect.Effect<void, PersistenceRedis.RedisError>,
    PersistenceRedis.RedisError,
    Scope.Scope
  >;
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/jobs/Redis",
) {}

// Disconnecting also removes subscriptions; keep error listeners until the socket
// is closed so a cleanup failure cannot become an unhandled EventEmitter error.
const closeClient = (client: {
  readonly isOpen: boolean;
  close(): Promise<unknown>;
  destroy(): void;
}) =>
  Effect.tryPromise({
    try: async () => {
      if (client.isOpen) await client.close();
    },
    catch: (cause) => new ConnectionError({ operation: "close Redis", cause }),
  }).pipe(
    Effect.timeout("5 seconds"),
    Effect.catch((error) => Effect.logError("Redis cleanup failed", error)),
    Effect.ensuring(
      Effect.sync(() => {
        if (client.isOpen) client.destroy();
      }),
    ),
  );

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* JobQueueConfig.Service;
    const client = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const client = createClient({
          url: Redacted.value(config.redisUrl),
          disableOfflineQueue: true,
          socket: { connectTimeout: 10_000, reconnectStrategy: false },
        });
        client.on("error", (cause) => {
          console.error("Redis client error", cause);
        });
        return client;
      }),
      closeClient,
    );

    yield* Effect.tryPromise({
      try: () => client.connect(),
      catch: (cause) =>
        new ConnectionError({ operation: "connect to Redis", cause }),
    }).pipe(
      Effect.timeout("10 seconds"),
      Effect.mapError(
        (cause) =>
          new ConnectionError({ operation: "connect to Redis", cause }),
      ),
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

    const subscribe: Interface["subscribe"] = (channel, onMessage) =>
      Effect.gen(function* () {
        const subscriber = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const subscriber = client.duplicate();
            subscriber.on("error", (cause) => {
              console.error("Redis subscriber error", cause);
            });
            return subscriber;
          }),
          closeClient,
        );

        yield* Effect.tryPromise({
          try: async () => {
            await subscriber.connect();
            await subscriber.subscribe(channel, (message, receivedChannel) =>
              onMessage({
                channel: receivedChannel,
                message,
              }),
            );
          },
          catch: (cause) => new PersistenceRedis.RedisError({ cause }),
        }).pipe(
          Effect.timeout("10 seconds"),
          Effect.mapError(
            (cause) => new PersistenceRedis.RedisError({ cause }),
          ),
        );
      }).pipe(Effect.as(Effect.never));

    return Service.of({ ping, send, subscribe });
  }),
);

export const persistenceLayer = Layer.effect(
  PersistenceRedis.Redis,
  Effect.gen(function* () {
    const redis = yield* Service;
    return yield* PersistenceRedis.make({
      send: redis.send,
      subscribe: redis.subscribe,
    });
  }),
);
