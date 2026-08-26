import { describe, expect, it } from "@effect/vitest";
import * as EmailQueue from "@prosewire/jobs/email-queue";
import { Effect, Layer } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import { DurableQueue, WorkflowEngine } from "effect/unstable/workflow";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { PostId, PublishedPost } from "./domain.ts";
import { EmailDelivery } from "./email-delivery.ts";
import { EmailOutbox } from "./email-outbox.ts";
import { Publishing } from "./publishing.ts";
import {
  AnalyticsRetentionWorkflow,
  EmailDeliveryWorkflow,
  EmailOutboxWorkflow,
  handlersLayer,
  ScheduledPublishingWorkflow,
} from "./workflows.ts";

const now = "2026-08-25T12:00:00.000Z";

function testLayer(state: {
  published: number;
  pruned: number;
  outboxCalls: number;
  delivered: Array<EmailQueue.EmailDeliveryJob>;
}) {
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
        }),
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
  it.effect("deduplicates publishing and retention execution ids", () => {
    const state = {
      published: 0,
      pruned: 0,
      outboxCalls: 0,
      delivered: [] as Array<EmailQueue.EmailDeliveryJob>,
    };

    return Effect.gen(function* () {
      const published = yield* Effect.all(
        [
          ScheduledPublishingWorkflow.execute({ requestedAt: now }),
          ScheduledPublishingWorkflow.execute({ requestedAt: now }),
        ],
        { concurrency: "unbounded" },
      );
      const retained = yield* Effect.all(
        [
          AnalyticsRetentionWorkflow.execute({ requestedAt: now }),
          AnalyticsRetentionWorkflow.execute({
            requestedAt: "2026-08-25T23:59:00.000Z",
          }),
        ],
        { concurrency: "unbounded" },
      );

      expect(published[0]).toEqual(published[1]);
      expect(retained).toEqual([3, 3]);
      expect(state.published).toBe(1);
      expect(state.pruned).toBe(1);
    }).pipe(Effect.provide(testLayer(state)));
  });

  it.effect("drains the outbox inside its workflow", () => {
    const state = {
      published: 0,
      pruned: 0,
      outboxCalls: 0,
      delivered: [] as Array<EmailQueue.EmailDeliveryJob>,
    };

    return Effect.gen(function* () {
      const result = yield* EmailOutboxWorkflow.execute({
        requestId: "request-1",
        requestedAt: now,
      });

      expect(result).toEqual({ dispatched: 2, deferred: 0 });
      expect(state.outboxCalls).toBe(2);
    }).pipe(Effect.provide(testLayer(state)));
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
});
