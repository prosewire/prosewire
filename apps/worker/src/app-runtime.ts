import { Layer, ManagedRuntime, type Effect } from "effect";
import { Publishing } from "./publishing.ts";
import { PublishingRepository } from "./publishing-repository.ts";
import { ShutdownSignal } from "./shutdown.ts";
import { WorkerConfig } from "./worker-config.ts";

const repositoryLayer = PublishingRepository.layer.pipe(
  Layer.provideMerge(WorkerConfig.layer),
);

const applicationLayer = Publishing.layer.pipe(
  Layer.provideMerge(repositoryLayer),
);

const runtimeLayer = ShutdownSignal.layer.pipe(
  Layer.provideMerge(applicationLayer),
);

export const workerRuntime = ManagedRuntime.make(runtimeLayer);

export type WorkerServices =
  | WorkerConfig
  | PublishingRepository.Service
  | Publishing.Service
  | ShutdownSignal;

export function runWorkerEffect<A, E>(
  effect: Effect.Effect<A, E, WorkerServices>,
): Promise<A> {
  return workerRuntime.runPromise(effect);
}

export const disposeWorkerRuntime = (): Promise<void> => workerRuntime.dispose();

export * as WorkerAppRuntime from "./app-runtime.js";
