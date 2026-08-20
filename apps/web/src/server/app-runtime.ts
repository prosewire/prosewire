import { Layer, ManagedRuntime, type Effect } from "effect";
import { BlogAccess } from "./authorization.ts";
import { ApiAccess } from "./api-access.ts";
import { ApiContent } from "./api-content.ts";
import { Auth } from "./auth-service.ts";
import { WebConfig } from "./config.ts";
import { ContentQueries } from "./content-queries.ts";
import { Dashboard } from "./dashboard.ts";
import { Database } from "./database.ts";
import { PostExport } from "./post-export.ts";
import { PublicContent } from "./public-content.ts";
import { Publishing } from "./publishing.ts";
import { Seed } from "./seed.ts";
import { SeedConfig } from "./seed-config.ts";

const databaseLayer = Database.layer.pipe(
  Layer.provideMerge(WebConfig.layer),
);

const infrastructureLayer = Layer.mergeAll(
  Auth.layer,
  SeedConfig.layer,
).pipe(Layer.provideMerge(databaseLayer));

const domainLayer = Layer.mergeAll(
  ContentQueries.layer,
  BlogAccess.layer,
  ApiAccess.layer,
  ApiContent.layer,
).pipe(Layer.provideMerge(infrastructureLayer));

const applicationLayer = Layer.mergeAll(
  Dashboard.layer,
  PostExport.layer,
  PublicContent.layer,
  Publishing.layer,
  Seed.layer,
).pipe(Layer.provideMerge(domainLayer));

export const appRuntime = ManagedRuntime.make(applicationLayer);

export type AppServices =
  | Auth
  | Database
  | WebConfig
  | SeedConfig
  | ContentQueries.Service
  | BlogAccess.Service
  | ApiAccess.Service
  | ApiContent.Service
  | Dashboard.Service
  | PostExport.Service
  | PublicContent.Service
  | Publishing.Service
  | Seed.Service;

export function runAppEffect<A, E>(
  effect: Effect.Effect<A, E, AppServices>,
  signal?: AbortSignal,
): Promise<A> {
  return appRuntime.runPromise(effect, { signal });
}

export const disposeAppRuntime = (): Promise<void> => appRuntime.dispose();

export * as AppRuntime from "./app-runtime";
