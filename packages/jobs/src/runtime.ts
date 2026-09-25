import { Layer } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import * as JobQueueConfig from "./config.ts";
import { migrateLegacyIdentities } from "./email-queue.ts";
import * as JobRedis from "./redis.ts";

export const layer = <E, R>(
  configLayer: Layer.Layer<JobQueueConfig.Service, E, R>,
) => {
  const redisLayer = JobRedis.layer.pipe(Layer.provideMerge(configLayer));
  const readyRedisLayer = Layer.effectDiscard(migrateLegacyIdentities()).pipe(
    Layer.provideMerge(redisLayer),
  );
  const persistenceLayer = JobRedis.persistenceLayer.pipe(
    Layer.provideMerge(readyRedisLayer),
  );
  const storeLayer = PersistedQueue.layerStoreRedis({
    prefix: JobQueueConfig.redisQueuePrefix,
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
