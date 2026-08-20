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
import { processSingleton } from "./process-singleton.ts";

const databaseLayer = Database.layer.pipe(
  Layer.provideMerge(WebConfig.layer),
);

const infrastructureLayer = Auth.layer.pipe(
  Layer.provideMerge(databaseLayer),
);

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
).pipe(Layer.provideMerge(domainLayer));

export const appRuntime = processSingleton(
  "@prosewire/web/AppRuntime/v1",
  () => ManagedRuntime.make(applicationLayer),
);

export type AppServices =
  | Auth
  | Database
  | WebConfig
  | ContentQueries.Service
  | BlogAccess.Service
  | ApiAccess.Service
  | ApiContent.Service
  | Dashboard.Service
  | PostExport.Service
  | PublicContent.Service
  | Publishing.Service;

export function runAppEffect<A, E>(
  effect: Effect.Effect<A, E, AppServices>,
  signal?: AbortSignal,
): Promise<A> {
  return appRuntime.runPromise(effect, { signal });
}

export * as AppRuntime from "./app-runtime";
