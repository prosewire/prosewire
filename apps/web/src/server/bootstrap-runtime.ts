import { Layer, ManagedRuntime } from "effect";
import { WebConfig } from "./config.ts";
import { Database } from "./database.ts";
import { Seed } from "./seed.ts";
import { SeedConfig } from "./seed-config.ts";

const databaseLayer = Database.layer.pipe(
  Layer.provideMerge(WebConfig.layer),
);

const bootstrapLayer = Seed.layer.pipe(
  Layer.provideMerge(SeedConfig.layer),
  Layer.provideMerge(databaseLayer),
);

export const makeBootstrapRuntime = () => ManagedRuntime.make(bootstrapLayer);
