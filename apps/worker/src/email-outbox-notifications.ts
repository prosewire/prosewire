import type { Db } from "@prosewire/db/client";
import { emailOutboxNotificationChannel } from "@prosewire/jobs/email-queue";
import {
  Context,
  Deferred,
  Duration,
  Effect,
  Layer,
  Queue,
  Schema,
} from "effect";
import { WorkerDatabase } from "./database.ts";

const reconnectDelay = Duration.seconds(1);

export class EmailOutboxNotificationError extends Schema.TaggedError<EmailOutboxNotificationError>()(
  "EmailOutboxNotificationError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export interface NotificationConnection {
  readonly listen: (channel: string) => Promise<void>;
  readonly onNotification: (listener: (channel: string) => void) => () => void;
  readonly onDisconnect: (listener: (cause: unknown) => void) => () => void;
  readonly close: () => void;
}

export interface NotificationSource {
  readonly connect: () => Promise<NotificationConnection>;
}

export interface Interface {
  readonly wait: Effect.Effect<void>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/worker/EmailOutboxNotifications",
) {}

function quotedIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL notification channel: ${identifier}`);
  }
  return `"${identifier}"`;
}

export function postgresSource(db: Db): NotificationSource {
  return {
    connect: async () => {
      const client = await db.$client.connect();
      return {
        listen: async (channel) => {
          await client.query(`LISTEN ${quotedIdentifier(channel)}`);
        },
        onNotification: (listener) => {
          const handler = (notification: { readonly channel: string }) => {
            listener(notification.channel);
          };
          client.on("notification", handler);
          return () => client.off("notification", handler);
        },
        onDisconnect: (listener) => {
          const onError = (cause: Error) => listener(cause);
          const onEnd = () => listener(new Error("PostgreSQL listener ended"));
          client.on("error", onError);
          client.on("end", onEnd);
          return () => {
            client.off("error", onError);
            client.off("end", onEnd);
          };
        },
        close: () => client.release(true),
      };
    },
  };
}

function listenOnce(
  source: NotificationSource,
  wakeups: Queue.Queue<void>,
  ready: Deferred.Deferred<void>,
): Effect.Effect<never, EmailOutboxNotificationError> {
  return Effect.acquireUseRelease(
    Effect.tryPromise({
      try: () => source.connect(),
      catch: (cause) =>
        new EmailOutboxNotificationError({
          operation: "connect PostgreSQL listener",
          cause,
        }),
    }),
    (connection) =>
      Effect.callback<never, EmailOutboxNotificationError>((resume) => {
        let active = true;
        const disconnect = (cause: unknown) => {
          if (!active) return;
          active = false;
          resume(
            Effect.fail(
              new EmailOutboxNotificationError({
                operation: "listen for email outbox notifications",
                cause,
              }),
            ),
          );
        };
        const removeNotification = connection.onNotification((channel) => {
          if (channel === emailOutboxNotificationChannel) {
            Queue.offerUnsafe(wakeups, undefined);
          }
        });
        const removeDisconnect = connection.onDisconnect(disconnect);

        void connection
          .listen(emailOutboxNotificationChannel)
          .then(() => {
            Deferred.doneUnsafe(ready, Effect.void);
          })
          .catch(disconnect);

        return Effect.sync(() => {
          active = false;
          removeNotification();
          removeDisconnect();
        });
      }),
    (connection) => Effect.sync(() => connection.close()),
  );
}

export const layerWith = (
  source: NotificationSource,
  retryDelay: Duration.Duration = reconnectDelay,
) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const wakeups = yield* Queue.sliding<void>(1);
      const ready = yield* Deferred.make<void>();
      const maintainListener = listenOnce(source, wakeups, ready).pipe(
        Effect.tapError((error) =>
          Effect.logError("Email outbox notification listener failed", error),
        ),
        Effect.catch(() => Effect.sleep(retryDelay)),
        Effect.forever,
      );
      yield* maintainListener.pipe(Effect.forkScoped);
      yield* Deferred.await(ready);
      return Service.of({ wait: Queue.take(wakeups) });
    }),
  );

export const layer = Layer.unwrap(
  Effect.map(WorkerDatabase.Service, ({ client }) =>
    layerWith(postgresSource(client)),
  ),
);

export * as EmailOutboxNotifications from "./email-outbox-notifications.js";
