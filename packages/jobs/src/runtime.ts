import { Layer } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import type * as JobQueueConfig from "./config.ts";
import * as JobRedis from "./redis.ts";

export const layer = <E, R>(
  configLayer: Layer.Layer<JobQueueConfig.Service, E, R>,
) => {
  const redisLayer = JobRedis.layer.pipe(Layer.provideMerge(configLayer));
  const persistenceLayer = JobRedis.persistenceLayer.pipe(
    Layer.provideMerge(redisLayer),
  );
  const storeLayer = PersistedQueue.layerStoreRedis({
    prefix: "{prosewire-jobs}:effectq:",
  }).pipe(Layer.provideMerge(persistenceLayer));
  const factoryLayer = PersistedQueue.layer.pipe(
    Layer.provideMerge(storeLayer),
  );

  return Layer.mergeAll(
    configLayer,
    redisLayer,
    persistenceLayer,
    storeLayer,
    factoryLayer,
  );
};
