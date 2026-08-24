import * as JobQueueConfig from "@prosewire/jobs/config";
import type * as EmailQueue from "@prosewire/jobs/email-queue";
import type * as JobRedis from "@prosewire/jobs/redis";
import * as JobQueueRuntime from "@prosewire/jobs/runtime";
import { Effect, Layer, ManagedRuntime } from "effect";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { WorkerDatabase } from "./database.ts";
import { EmailDelivery } from "./email-delivery.ts";
import { Publishing } from "./publishing.ts";
import { PublishingRepository } from "./publishing-repository.ts";
import { ShutdownSignal } from "./shutdown.ts";
import { WorkerConfig } from "./worker-config.ts";

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

const repositoryLayer = PublishingRepository.layer.pipe(
  Layer.provideMerge(databaseLayer),
);

const retentionLayer = AnalyticsRetention.layer.pipe(
  Layer.provideMerge(databaseLayer),
);

const emailDeliveryLayer = EmailDelivery.layer.pipe(
  Layer.provideMerge(configLayer),
  Layer.provideMerge(jobQueueLayer),
);

const publishingLayer = Publishing.layer.pipe(Layer.provide(repositoryLayer));

const runtimeLayer = Layer.mergeAll(
  configLayer,
  databaseLayer,
  jobQueueLayer,
  repositoryLayer,
  retentionLayer,
  emailDeliveryLayer,
  publishingLayer,
  ShutdownSignal.layer,
);

export const workerRuntime = ManagedRuntime.make(runtimeLayer);

export type WorkerServices =
  | WorkerConfig
  | WorkerDatabase.Service
  | JobRedis.Service
  | EmailQueue.Service
  | PublishingRepository.Service
  | Publishing.Service
  | AnalyticsRetention.Service
  | EmailDelivery.Service
  | ShutdownSignal;

export function runWorkerEffect<A, E>(
  effect: Effect.Effect<A, E, WorkerServices>,
): Promise<A> {
  return workerRuntime.runPromise(effect);
}

export const disposeWorkerRuntime = (): Promise<void> =>
  workerRuntime.dispose();

export * as WorkerAppRuntime from "./app-runtime.js";
