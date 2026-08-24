import { Context, Effect, Layer, Schema } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import { EmailOutboxId } from "./domain.ts";

export class EmailDeliveryJob extends Schema.Class<EmailDeliveryJob>(
  "EmailQueue.EmailDeliveryJob",
)({
  outboxId: EmailOutboxId,
}) {}

export class EmailQueueError extends Schema.TaggedError<EmailQueueError>()(
  "EmailQueueError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export interface Interface {
  readonly offer: (
    outboxId: EmailOutboxId,
  ) => Effect.Effect<void, EmailQueueError>;
  readonly take: <E>(
    handle: (job: EmailDeliveryJob) => Effect.Effect<void, E>,
  ) => Effect.Effect<void, E | EmailQueueError>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/worker/EmailQueue",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const queue = yield* PersistedQueue.make({
      name: "prosewire-email-v1",
      schema: EmailDeliveryJob,
    });
    const mapQueueError =
      (operation: string) =>
      <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, EmailQueueError> =>
        effect.pipe(
          Effect.mapError((cause) => new EmailQueueError({ operation, cause })),
        );

    const take = <E>(
      handle: (job: EmailDeliveryJob) => Effect.Effect<void, E>,
    ): Effect.Effect<void, E | EmailQueueError> =>
      queue.take(handle, { maxAttempts: 100 }).pipe(
        Effect.catch((error) => {
          const mapped: E | EmailQueueError =
            error instanceof PersistedQueue.PersistedQueueError ||
            Schema.isSchemaError(error)
              ? new EmailQueueError({
                  operation: "take email delivery",
                  cause: error,
                })
              : (error as E);
          return Effect.fail(mapped);
        }),
      );

    return Service.of({
      offer: Effect.fn("EmailQueue.offer")((outboxId: EmailOutboxId) =>
        queue
          .offer(new EmailDeliveryJob({ outboxId }))
          .pipe(Effect.asVoid, mapQueueError("offer email delivery")),
      ),
      take: Effect.fn("EmailQueue.take")(take),
    });
  }),
);

export * as EmailQueue from "./email-queue.js";
