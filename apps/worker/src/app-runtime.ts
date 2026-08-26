import * as JobQueueConfig from "@prosewire/jobs/config";
import type * as JobRedis from "@prosewire/jobs/redis";
import * as JobQueueRuntime from "@prosewire/jobs/runtime";
import { Effect, Layer, ManagedRuntime } from "effect";
import { ClusterWorkflowEngine } from "effect/unstable/cluster";
import * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { WorkerDatabase } from "./database.ts";
import { EmailDelivery } from "./email-delivery.ts";
import { EmailOutbox } from "./email-outbox.ts";
import { EmailOutboxNotifications } from "./email-outbox-notifications.ts";
import { Publishing } from "./publishing.ts";
import { PublishingRepository } from "./publishing-repository.ts";
import { ShutdownSignal } from "./shutdown.ts";
import { WorkerConfig } from "./worker-config.ts";
import { clusterLayer } from "./workflow-storage.ts";
import * as Workflows from "./workflows.ts";

const configLayer = WorkerConfig.layer;

const databaseLayer = WorkerDatabase.layer.pipe(
  Layer.provideMerge(configLayer),
);

const jobQueueConfigLayer = Layer.effect(
  JobQueueConfig.Service,
  Effect.gen(function* () {
    const config = yield* WorkerConfig;
    return JobQueueConfig.Service.of({ redisUrl: config.redisUrl });
  }),
).pipe(Layer.provideMerge(configLayer));

const jobQueueLayer = JobQueueRuntime.layer(jobQueueConfigLayer);

const workflowClusterLayer = Layer.unwrap(
  Effect.map(WorkerConfig, (config) => clusterLayer(config.databaseUrl)),
).pipe(Layer.provideMerge(configLayer));

const workflowEngineLayer = ClusterWorkflowEngine.layer.pipe(
  Layer.provideMerge(workflowClusterLayer),
);

const repositoryLayer = PublishingRepository.layer.pipe(
  Layer.provideMerge(databaseLayer),
);

const retentionLayer = AnalyticsRetention.layer.pipe(
  Layer.provideMerge(databaseLayer),
);

const emailDeliveryLayer = EmailDelivery.layer.pipe(
  Layer.provideMerge(configLayer),
);

const emailOutboxLayer = Layer.effect(
  EmailOutbox.Service,
  Effect.gen(function* () {
    const database = yield* WorkerDatabase.Service;
    const workflowEngine = yield* WorkflowEngine.WorkflowEngine;
    const queue: EmailOutbox.Queue = {
      offer: (message) =>
        Workflows.startEmailDelivery(message).pipe(
          Effect.provideService(WorkflowEngine.WorkflowEngine, workflowEngine),
          Effect.sandbox,
        ),
    };
    return EmailOutbox.Service.of(
      EmailOutbox.make(
        EmailOutbox.drizzleStore(database.client),
        queue,
        crypto.randomUUID(),
      ),
    );
  }),
).pipe(
  Layer.provideMerge(databaseLayer),
  Layer.provideMerge(workflowEngineLayer),
);

const emailOutboxNotificationsLayer = EmailOutboxNotifications.layer.pipe(
  Layer.provideMerge(databaseLayer),
);

const publishingLayer = Publishing.layer.pipe(Layer.provide(repositoryLayer));

const workflowHandlersLayer = Workflows.handlersLayer.pipe(
  Layer.provideMerge(publishingLayer),
  Layer.provideMerge(retentionLayer),
  Layer.provideMerge(emailOutboxLayer),
  Layer.provideMerge(jobQueueLayer),
  Layer.provideMerge(workflowEngineLayer),
);

const emailWorkerLayer = Layer.unwrap(
  Effect.map(WorkerConfig, (config) =>
    Workflows.emailWorkerLayer(config.emailWorkerConcurrency),
  ),
).pipe(
  Layer.provideMerge(configLayer),
  Layer.provideMerge(emailDeliveryLayer),
  Layer.provideMerge(jobQueueLayer),
  Layer.provideMerge(workflowEngineLayer),
);

const runtimeLayer = Layer.mergeAll(
  configLayer,
  databaseLayer,
  jobQueueLayer,
  workflowEngineLayer,
  repositoryLayer,
  retentionLayer,
  emailDeliveryLayer,
  emailOutboxLayer,
  emailOutboxNotificationsLayer,
  publishingLayer,
  workflowHandlersLayer,
  emailWorkerLayer,
  ShutdownSignal.layer,
);

export const workerRuntime = ManagedRuntime.make(runtimeLayer);

export type WorkerServices =
  | WorkerConfig
  | WorkerDatabase.Service
  | JobRedis.Service
  | WorkflowEngine.WorkflowEngine
  | PublishingRepository.Service
  | Publishing.Service
  | AnalyticsRetention.Service
  | EmailDelivery.Service
  | EmailOutbox.Service
  | EmailOutboxNotifications.Service
  | ShutdownSignal;

export function runWorkerEffect<A, E>(
  effect: Effect.Effect<A, E, WorkerServices>,
): Promise<A> {
  return workerRuntime.runPromise(effect);
}

export const disposeWorkerRuntime = (): Promise<void> =>
  workerRuntime.dispose();

export * as WorkerAppRuntime from "./app-runtime.js";
