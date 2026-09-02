import { type Effect, Layer, ManagedRuntime } from "effect";
import { AccountSecurity } from "./account-security.ts";
import { ApiAccess } from "./api-access.ts";
import { ApiContent } from "./api-content.ts";
import { Auth } from "./auth-service.ts";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { ContentQueries } from "./content-queries.ts";
import { Dashboard } from "./dashboard.ts";
import { Database } from "./database.ts";
import { Media } from "./media.ts";
import { MediaImage } from "./media-image.ts";
import { ObjectStorage } from "./object-storage.ts";
import { PlatformCrypto } from "./platform-crypto.ts";
import { PostExport } from "./post-export.ts";
import { processSingleton } from "./process-singleton.ts";
import { PublicContent } from "./public-content.ts";
import { Publishing } from "./publishing.ts";
import { WorkspaceManagement } from "./workspace-management.ts";

const configLayer = WebConfig.layer;

const databaseLayer = Database.layer.pipe(Layer.provideMerge(configLayer));

const infrastructureLayer = Layer.mergeAll(
  Auth.layer,
  MediaImage.layer,
  ObjectStorage.layer,
  PlatformCrypto.layer,
).pipe(Layer.provideMerge(databaseLayer));

const domainLayer = Layer.mergeAll(
  ContentQueries.layer,
  BlogAccess.layer,
  ApiAccess.layer,
  ApiContent.layer,
).pipe(Layer.provideMerge(infrastructureLayer));

const applicationLayer = Layer.mergeAll(
  AccountSecurity.layer,
  Dashboard.layer,
  Media.layer,
  PostExport.layer,
  PublicContent.layer,
  Publishing.live,
  WorkspaceManagement.live,
).pipe(Layer.provideMerge(domainLayer));

export const appRuntime = processSingleton("@prosewire/web/AppRuntime/v1", () =>
  ManagedRuntime.make(applicationLayer),
);

export type AppServices =
  | Auth
  | AccountSecurity.Service
  | WebConfig
  | ContentQueries.Service
  | BlogAccess.Service
  | ApiAccess.Service
  | ApiContent.Service
  | Dashboard.Service
  | Media.Service
  | PostExport.Service
  | PublicContent.Service
  | Publishing.Service
  | WorkspaceManagement.Service;

export function runAppEffect<A, E>(
  effect: Effect.Effect<A, E, AppServices>,
  signal?: AbortSignal,
): Promise<A> {
  return appRuntime.runPromise(effect, { signal });
}

export * as AppRuntime from "./app-runtime";
