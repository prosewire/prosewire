import { type Effect, Layer, ManagedRuntime } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { WorkerDatabase } from "./database.ts";
import { EmailOutbox } from "./email-outbox.ts";
import { EmailQueue } from "./email-queue.ts";
import { Publishing } from "./publishing.ts";
import { PublishingRepository } from "./publishing-repository.ts";
import { WorkerRedis } from "./redis.ts";
import { ShutdownSignal } from "./shutdown.ts";
import { WorkerConfig } from "./worker-config.ts";

const configLayer = WorkerConfig.layer;

const databaseLayer = WorkerDatabase.layer.pipe(
  Layer.provideMerge(configLayer),
);

const redisLayer = WorkerRedis.layer.pipe(Layer.provideMerge(configLayer));

const persistenceRedisLayer = WorkerRedis.persistenceLayer.pipe(
  Layer.provideMerge(redisLayer),
);

const queueStoreLayer = PersistedQueue.layerStoreRedis({
  prefix: "{prosewire-worker}:effectq:",
}).pipe(Layer.provideMerge(persistenceRedisLayer));

const queueFactoryLayer = PersistedQueue.layer.pipe(
  Layer.provideMerge(queueStoreLayer),
);

const emailQueueLayer = EmailQueue.layer.pipe(
  Layer.provideMerge(queueFactoryLayer),
);

const repositoryLayer = PublishingRepository.layer.pipe(
  Layer.provideMerge(databaseLayer),
);

const retentionLayer = AnalyticsRetention.layer.pipe(
  Layer.provideMerge(databaseLayer),
);

const emailOutboxLayer = EmailOutbox.layer.pipe(
  Layer.provideMerge(databaseLayer),
  Layer.provideMerge(emailQueueLayer),
);

const publishingLayer = Publishing.layer.pipe(Layer.provide(repositoryLayer));

const runtimeLayer = Layer.mergeAll(
  configLayer,
  databaseLayer,
  redisLayer,
  persistenceRedisLayer,
  queueStoreLayer,
  queueFactoryLayer,
  emailQueueLayer,
  repositoryLayer,
  retentionLayer,
  emailOutboxLayer,
  publishingLayer,
  ShutdownSignal.layer,
);

export const workerRuntime = ManagedRuntime.make(runtimeLayer);

export type WorkerServices =
  | WorkerConfig
  | WorkerDatabase.Service
  | WorkerRedis.Service
  | EmailQueue.Service
  | PublishingRepository.Service
  | Publishing.Service
  | AnalyticsRetention.Service
  | EmailOutbox.Service
  | ShutdownSignal;

export function runWorkerEffect<A, E>(
  effect: Effect.Effect<A, E, WorkerServices>,
): Promise<A> {
  return workerRuntime.runPromise(effect);
}

export const disposeWorkerRuntime = (): Promise<void> =>
  workerRuntime.dispose();

export * as WorkerAppRuntime from "./app-runtime.js";
