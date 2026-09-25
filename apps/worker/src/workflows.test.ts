import { describe, expect, it } from "@effect/vitest";
import * as EmailQueue from "@prosewire/jobs/email-queue";
import { Effect, Layer } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import { DurableQueue, WorkflowEngine } from "effect/unstable/workflow";
import {
  AnalyticsRetention,
  AnalyticsRetentionError,
} from "./analytics-retention.ts";
import { PostId, PublishedPost } from "./domain.ts";
import { EmailDelivery } from "./email-delivery.ts";
import { EmailOutbox } from "./email-outbox.ts";
import { Publishing } from "./publishing.ts";
import {
  EmailDeliveryWorkflow,
  emailWorkerLayer,
  handlersLayer,
  startAnalyticsRetention,
  startEmailOutbox,
  startScheduledPublishing,
} from "./workflows.ts";

const now = "2026-08-25T12:00:00.000Z";

function testLayer(
  state: {
    published: number;
    pruned: number;
    outboxCalls: number;
    delivered: Array<EmailQueue.EmailDeliveryJob>;
  },
  failure?: EmailQueue.EmailDeliveryError,
) {
  const services = Layer.mergeAll(
    Layer.succeed(Publishing.Service, {
      publishScheduled: () =>
        Effect.sync(() => {
          state.published += 1;
          return [
            new PublishedPost({
              id: PostId.make("11111111-1111-4111-8111-111111111111"),
              title: "Ready",
            }),
          ];
        }),
    }),
    Layer.succeed(AnalyticsRetention.Service, {
      pruneExpired: () =>
        Effect.sync(() => {
          state.pruned += 1;
          return 3;
        }),
    }),
    Layer.succeed(EmailOutbox.Service, {
      dispatchPending: () =>
        Effect.sync(() => {
          state.outboxCalls += 1;
          return state.outboxCalls === 1
            ? { dispatched: 2, deferred: 0 }
            : { dispatched: 0, deferred: 0 };
        }),
    }),
    Layer.succeed(EmailDelivery.Service, {
      deliver: (message) =>
        Effect.sync(() => {
          state.delivered.push(message);
        }).pipe(Effect.andThen(failure ? Effect.fail(failure) : Effect.void)),
    }),
  );
  const infrastructure = Layer.merge(
    WorkflowEngine.layerMemory,
    PersistedQueue.layer.pipe(Layer.provide(PersistedQueue.layerStoreMemory)),
  );
  return handlersLayer.pipe(
    Layer.provideMerge(services),
    Layer.provideMerge(infrastructure),
  );
}

describe("worker workflows", () => {
  it.effect("runs repeatable scans without requiring workflow storage", () => {
    const state = {
      published: 0,
      pruned: 0,
      outboxCalls: 0,
      delivered: [] as Array<EmailQueue.EmailDeliveryJob>,
    };

    return Effect.gen(function* () {
      const published = yield* Effect.all(
        [
          startScheduledPublishing(new Date(now)),
          startScheduledPublishing(new Date(now)),
        ],
        { concurrency: "unbounded" },
      );
      const retained = yield* Effect.all(
        [
          startAnalyticsRetention(new Date(now)),
          startAnalyticsRetention(new Date("2026-08-25T23:59:00.000Z")),
        ],
        { concurrency: "unbounded" },
      );

      expect(published[0]).toEqual(published[1]);
      expect(retained).toEqual([3, 3]);
      expect(state.published).toBe(2);
      expect(state.pruned).toBe(2);
    }).pipe(Effect.provide(testLayer(state)));
  });

  it.effect("waits for the complete outbox drain", () => {
    const state = {
      published: 0,
      pruned: 0,
      outboxCalls: 0,
      delivered: [] as Array<EmailQueue.EmailDeliveryJob>,
    };

    return Effect.gen(function* () {
      const result = yield* startEmailOutbox();

      expect(result).toEqual({ dispatched: 2, deferred: 0 });
      expect(state.outboxCalls).toBe(2);
    }).pipe(Effect.provide(testLayer(state)));
  });

  it.effect("retries retention after a failed run on the same day", () => {
    let attempts = 0;
    return Effect.gen(function* () {
      const first = yield* Effect.result(
        startAnalyticsRetention(new Date(now)),
      );
      expect(first._tag).toBe("Failure");
      expect(yield* startAnalyticsRetention(new Date(now))).toBe(3);
      expect(attempts).toBe(2);
    }).pipe(
      Effect.provideService(AnalyticsRetention.Service, {
        pruneExpired: () =>
          Effect.suspend(() =>
            ++attempts === 1
              ? Effect.fail(
                  new AnalyticsRetentionError({
                    operation: "prune",
                    cause: new Error("temporary failure"),
                  }),
                )
              : Effect.succeed(3),
          ),
      }),
    );
  });

  it.effect("waits for Redis-style queue work before completing email", () => {
    const state = {
      published: 0,
      pruned: 0,
      outboxCalls: 0,
      delivered: [] as Array<EmailQueue.EmailDeliveryJob>,
    };
    const message = new EmailQueue.EmailDeliveryJob({
      outboxId: "outbox-1",
      recipient: "person@example.com",
      subject: "Invitation",
      text: "Join the workspace",
      html: null,
    });

    return Effect.gen(function* () {
      const delivery = yield* EmailDelivery.Service;
      yield* DurableQueue.makeWorker(EmailQueue.queue, delivery.deliver).pipe(
        Effect.forkChild,
      );
      yield* EmailDeliveryWorkflow.execute(message);

      expect(state.delivered).toEqual([message]);
    }).pipe(Effect.provide(testLayer(state)));
  });
  it.effect("does not retry permanent SMTP rejection", () => {
    const state = {
      published: 0,
      pruned: 0,
      outboxCalls: 0,
      delivered: [] as Array<EmailQueue.EmailDeliveryJob>,
    };
    const message = new EmailQueue.EmailDeliveryJob({
      outboxId: "permanent-1",
      recipient: "invalid@example.com",
      subject: "Invitation",
      text: "Join",
      html: null,
    });
    const failure = new EmailQueue.EmailDeliveryError({
      recipient: message.recipient,
      cause: { responseCode: 550, code: "EENVELOPE" },
    });
    return Effect.gen(function* () {
      const result = yield* Effect.result(
        EmailDeliveryWorkflow.execute(message),
      );
      expect(result._tag).toBe("Failure");
      expect(state.delivered).toHaveLength(1);
    }).pipe(
      Effect.provide(
        emailWorkerLayer(1).pipe(Layer.provideMerge(testLayer(state, failure))),
      ),
    );
  });
});
