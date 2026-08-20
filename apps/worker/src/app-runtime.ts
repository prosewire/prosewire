import { Layer, ManagedRuntime, type Effect } from "effect";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { WorkerDatabase } from "./database.ts";
import { Publishing } from "./publishing.ts";
import { PublishingRepository } from "./publishing-repository.ts";
import { ShutdownSignal } from "./shutdown.ts";
import { WorkerConfig } from "./worker-config.ts";

const configLayer = WorkerConfig.layer;

const databaseLayer = WorkerDatabase.layer.pipe(Layer.provideMerge(configLayer));

const repositoryLayer = PublishingRepository.layer.pipe(
  Layer.provideMerge(databaseLayer),
);

const retentionLayer = AnalyticsRetention.layer.pipe(
  Layer.provideMerge(databaseLayer),
);

const publishingLayer = Publishing.layer.pipe(Layer.provide(repositoryLayer));

const runtimeLayer = Layer.mergeAll(
  configLayer,
  databaseLayer,
  repositoryLayer,
  retentionLayer,
  publishingLayer,
  ShutdownSignal.layer,
);

export const workerRuntime = ManagedRuntime.make(runtimeLayer);

export type WorkerServices =
  | WorkerConfig
  | WorkerDatabase.Service
  | PublishingRepository.Service
  | Publishing.Service
  | AnalyticsRetention.Service
  | ShutdownSignal;

export function runWorkerEffect<A, E>(
  effect: Effect.Effect<A, E, WorkerServices>,
): Promise<A> {
  return workerRuntime.runPromise(effect);
}

export const disposeWorkerRuntime = (): Promise<void> => workerRuntime.dispose();

export * as WorkerAppRuntime from "./app-runtime.js";
